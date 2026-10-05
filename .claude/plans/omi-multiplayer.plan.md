# Plan: Omi Multiplayer Web Game

**Source of truth for rules**: `docs/omi-rules.md`
**Status**: awaiting confirmation (no code written yet)
**Complexity**: Medium to High (about 30–40 hours)

## Requirements

- Four players in two teams join a room by code and play Omi exactly as `docs/omi-rules.md` defines it.
- `packages/engine` holds the rules in pure TypeScript with no I/O, timers, or ambient randomness.
- `apps/server` (Node + Socket.IO) is authoritative and holds rooms in memory, each with 4 seats and a join code.
- `apps/web` is React + Vite.
- A client never receives another player's hand.
- Per rules §5, nobody receives their second 4 cards until trump is named.
- A dropped player can reclaim their seat within 60 seconds; after that a bot takes over and the match continues.
- The UI is designed and approved in Claude Design before any UI code is written.

The repo contains only `docs/omi-rules.md`, so there are no existing code patterns to mirror; the conventions are set in Phase 0.

## Phases

### Phase 0: Scaffold (small)

- `git init`, pnpm workspaces, strict TypeScript base config, ESLint and Prettier, Vitest, Playwright.
- One addition to the requested layout: `packages/protocol`, holding the Socket.IO event types and zod schemas shared by server and web. This keeps the engine free of network concerns.

### Phase 1: Engine (medium)

1. **Types and config:** `Card`, `Suit`, `Seat`, `Team`, and a `RulesConfig` mirroring §11, so every [EDIT] value is config and not hard-coded.
2. **State machine:** a single pure function `applyAction(state, action)` returns a new state plus events, or a typed error. The phases are `dealing-first-4`, `calling-trump`, `playing`, `round-scored` and `match-over`.
3. **Randomness:** an injected seeded RNG covers the shuffle, first dealer, and timeout tie-breaks, so every game is replayable in tests.
4. **Rules:**
   - dealing in two batches of 4;
   - follow-suit legality via `legalMoves(state, seat)`;
   - trick winner;
   - scoring 1 / 2 / 3 tokens;
   - non-stacking tie carry-over;
   - all 8 tricks always played;
   - dealer rotation;
   - match end at 10 tokens.
5. **Auto-actions:** `autoTrump` (most-held suit) and `autoPlay` (lowest legal card) are pure functions, used by both timeouts and the bot.
6. **Redaction:** `viewFor(state, seat)` lives in the engine and is the only shape that ever leaves the server. It contains:
   - the player's own hand;
   - the current and previous trick;
   - trump, trick counts, and tokens;
   - other players' card counts only.
7. **Tests, written first:**
   - a table-driven case for each rule line;
   - property tests: 32 unique cards, no illegal move accepted, and a view never contains another seat's cards;
   - a full seeded match replay;
   - a coverage target of 95% or higher.

### Phase 2: Server (medium to high)

1. **Rooms:** `RoomStore` is an in-memory map behind an interface.
   - Join codes are 6 characters from an unambiguous alphabet.
   - Empty rooms expire.
2. **Lobby:** create, join, ready and leave.
   - Seats are shuffled at start to satisfy "team selection: random".
   - The match starts when all 4 seats are filled and ready.
3. **Identity and reconnect:** the server issues an opaque session token on join, which the client stores and sends in the socket handshake.
   - A matching token rebinds the new socket to the old seat and sends a fresh view.
   - Seats are never identified by socket ID.
4. **Per-seat emission:** each socket gets its own `viewFor` output; game state is never broadcast to the room. A test asserts this on the raw payloads.
5. **Timers:** a 15-second turn timer is owned by the server and sent to clients as a deadline timestamp. On expiry the server applies the engine's auto-action.
6. **Disconnect and bot:** a 60-second hold begins on disconnect, with turn timeouts still applying. When it expires the seat is flagged as bot-controlled and plays via the auto-actions after a short delay.
7. **Hardening:**
   - zod validation on every inbound event;
   - turn and seat checks server-side;
   - per-socket rate limiting;
   - a CORS allowlist;
   - structured logs that never contain hands.
8. **Tests:** integration tests use real `socket.io-client` instances with fake timers. They cover the full match, illegal-move rejection, reconnect inside the hold, bot takeover after it, and hand leakage.

### Phase 3: UI design in Claude Design (small to medium; blocks Phase 4)

1. Propose a visual direction, palette, and type pairing specific to Omi, for approval or redirection. Not a generic card-table template.
2. A design canvas covers:
   - home (create or join);
   - lobby with seats and ready state;
   - the table during the trump call, with 4 cards showing;
   - trick play;
   - trick resolution;
   - the round result, including tie and kapothi;
   - match end;
   - the overlays for turn timer, "partner disconnected (hold countdown)", "bot playing", and reconnecting.
3. Each screen is drawn at 375 and 1440 widths.
4. Review and approval; the approved tokens and components become the build spec.

### Phase 4: Web UI (medium)

1. Design tokens become CSS custom properties, and components are organised by feature: `lobby/`, `table/`, `hand/`, `scoreboard/`.
2. A socket hook holds the server's view as the single source of state.
   - There are no optimistic card plays; the server confirms each one.
   - The room code lives in the URL and the session token in `localStorage`.
3. Only legal cards are playable, using `legalMoves` from the engine on the player's own view.
4. Accessibility and motion:
   - keyboard play;
   - visible focus states;
   - reduced-motion support;
   - transform and opacity animation only.
5. Component tests cover the hand, the trick area, and the reconnect states.

### Phase 5: E2E (medium)

- Playwright runs four browser contexts against a server started with a fixed seed.
- Flows:
  - create, join, ready, and a full round;
  - a full match to 10 tokens;
  - an illegal card is not playable;
  - reload mid-trick and resume in the same seat;
  - a closed tab leads to bot takeover and the match finishes.
- A leak test records every WebSocket frame for one client and asserts that no other player's card ever appears, and that no second-batch card arrives before trump is called.
- Screenshots are taken at 320, 768, 1024 and 1440.

## Risks

| Level | Risk | Mitigation |
|---|---|---|
| HIGH | A hand leaks through a broadcast, a log line, or an early second-batch deal | One redaction function, per-socket emit, and the frame-level leak test |
| HIGH | Races between timer expiry, a late play, and a reconnect | One serialized action queue per room; every action carries a turn ID and stale ones are rejected |
| MEDIUM | Rules gaps (below) get guessed in code | Resolve them in `omi-rules.md` before Phase 1 |
| MEDIUM | In-memory rooms are lost on a server restart | Accepted for v1; `RoomStore` interface allows a later swap |
| LOW | Session token theft lets someone take a seat | Random 128-bit token, scoped to one room, sent only in the handshake |

## Rules gaps to settle

To be written into `docs/omi-rules.md` before the engine starts. Proposed defaults (not yet confirmed):

1. **Reclaiming from the bot:** a player can take their seat back at any time, and the bot yields at the next action.
2. **Bot play:** the bot uses the same choices as the timeout rules, with no strategy in v1.
3. **"Lowest legal card" across suits:** lowest rank, preferring non-trump, with remaining ties broken by a fixed suit order.
4. **Tie followed by another tie:** the carry-over stays at 1 until a round is won.
5. **Kapothi with a carry-over:** 3 + 1 = 4 tokens.

## Estimates

| Phase | Estimate |
|---|---|
| Scaffold | 1–2 hours |
| Engine | 6–8 hours |
| Server | 8–10 hours |
| Design | 2–3 hours plus review |
| Web | 8–12 hours |
| E2E | 4–6 hours |
| **Total** | **about 30–40 hours** |

## Acceptance

- [ ] Rules gaps resolved in `docs/omi-rules.md`
- [ ] Engine tests pass at 95%+ coverage
- [ ] Server integration tests pass, including the hand-leak assertion
- [ ] UI design approved before Phase 4 starts
- [ ] E2E suite passes, including reconnect and bot takeover
