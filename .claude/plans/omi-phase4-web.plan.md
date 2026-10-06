# Plan: Omi Phase 4, Web UI

**Parent plan**: `.claude/plans/omi-multiplayer.plan.md`
**Design reference**: `docs/design/*.dc.html` (approved 2026-10-06), canvas https://claude.ai/artifact/XJNn9j2NRT1cKiG9J2mQQ6
**Status**: approved 2026-10-06, with the four defaults below
**Complexity**: Large (new app, about 40 files, plus small server and protocol additions)

## Summary

Build `apps/web` (React + Vite) to the approved design. The server's per-seat view is the only game state; the client never computes rules beyond showing the legal cards the server lists. The design artboards are a visual reference only, not code to ship.

## Stack

- Vite 8, React 19, TypeScript, `socket.io-client` 4.8.
- Vitest with Testing Library and jsdom. Playwright is Phase 5.
- Plain CSS with design tokens as custom properties, one stylesheet per feature. No Tailwind or component library.
- Manrope and Gemunu Libre installed as packages and self-hosted, so the page makes no request to a font CDN.
- No router or state library: two routes (home, room), and the server's view is the state.

## Approved defaults

1. **Session token storage:** `localStorage`, one entry per room, so a reload or a reopened tab can reclaim the seat.
2. **Room link:** the address is `/r/<CODE>`. Opening it asks for a name and joins.
3. **Motion:** short card-play and trick-collect animations, off under `prefers-reduced-motion`.
4. **Tidy-up first:** split the timer code out of `apps/server/src/gameService.ts` before adding to it. No behaviour change.

## Tasks

Tests first for each, one commit per task.

| # | Task | Where |
|---|---|---|
| 0 | Split timer handling out of `gameService.ts`; existing tests stay green | `apps/server` |
| 1 | Server additions the design needs (below) | `packages/protocol`, `apps/server` |
| 2 | Scaffold the web app; design tokens, fonts, base styles | `apps/web` |
| 3 | Card component in the approved style: four suits, playable, dimmed and winning states | `cards/` |
| 4 | Socket client: typed requests with acknowledgements, session token storage, automatic resume on reconnect | `net/` |
| 5 | Game store: room and game snapshots from the server, countdowns corrected for clock difference | `state/` |
| 6 | Home screen: name, create, join by code, error messages | `home/` |
| 7 | Lobby: code with copy, player list, host Remove and Start, leave | `lobby/` |
| 8 | Table: seats, trick area, score bars, trump, hand with legal cards only | `table/` |
| 9 | Trump call, trick won, round result (win, tie, kapothi), match end | `table/`, `results/` |
| 10 | Notices: reconnecting, another tab, removed, room closed | `notices/` |
| 11 | Desktop layouts for table and lobby; other screens centred | styles |
| 12 | Keyboard play, focus states, screen-reader labels, reduced motion | across |

Then a code review, plus a security review of token storage and of anything rendered from other players (names).

## Server additions (task 1)

The design shows three things the server does not send yet. All are public information and do not touch the hidden-card guarantees.

- **Hold deadline per player:** the room snapshot carries when each held seat will pass to a bot, for "away 0:41".
- **Deadline during the round pause:** the game snapshot's `deadline` is set while a round is scored, for "next round in 0:04".
- **Server time:** each snapshot carries the server's current time, so countdowns are right on a device whose clock is wrong.

## Screen-to-data map

| Screen | Data it reads |
|---|---|
| Home | none; sends `room:create` or `room:join` |
| Lobby | room snapshot: code, players, host, connection state |
| Trump call | view: phase, caller, hand (4 cards), deadline |
| Your turn | view: turn, legal moves, current trick, trump, tricks won, tokens |
| Trick won | events: `trick-won`; view: previous trick |
| Round result | view: last round, tokens, carry-over, deadline |
| Match end | view: winner, tokens, round number; room snapshot: seats and names |
| Notices | socket state, `session:replaced`, `room:closed` |

## Risks

| Level | Risk | Mitigation |
|---|---|---|
| HIGH | A player name rendered as HTML runs script in other players' browsers | Names are only ever rendered as text by React; no `dangerouslySetInnerHTML`; reviewed |
| MEDIUM | Session token in `localStorage` is readable by any script on the page | No third-party scripts, self-hosted fonts, a strict Content-Security-Policy in the page |
| MEDIUM | Countdown drift on devices with wrong clocks | Server time in every snapshot; client applies the offset |
| MEDIUM | Reconnect loops or duplicate resumes | One socket per tab, resume only on connect, guarded by tests with a fake socket |
| LOW | Fonts without Sinhala | Out of scope for now; the font stack names a Sinhala fallback |

## Deployment notes

- Whatever serves the built files must send `Content-Security-Policy: frame-ancestors 'none'` (or `X-Frame-Options: DENY`) as a response header. A policy in a meta tag cannot stop other sites framing the game.
- Set `VITE_SERVER_URL` at build time; it is written into the page's security policy.

## Out of scope

- Sinhala text, illustrated court cards, rematch, chat, sound.
- End-to-end tests with real browsers (Phase 5).

## Acceptance

- [ ] Every approved screen is built and matches the design at 390 and 1440 widths
- [ ] A full match can be played in four browser tabs against the real server
- [ ] Reload mid-trick resumes the same seat and hand
- [ ] Unit and component tests pass at 80% coverage or better
- [ ] No critical or high findings left from the code and security reviews
