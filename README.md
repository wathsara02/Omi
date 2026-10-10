# Omi

A room-based multiplayer web game for **Omi**, the Sri Lankan trick-taking card
game. Four players, two teams: call trump, win tricks, first team to ten tokens
wins the match.

One player creates a room and shares its six-character code. Three others join,
the host starts, and seats and teams are drawn at random.

## How it plays

- **Rules:** the exact variant is written down in [docs/omi-rules.md](docs/omi-rules.md).
  That file is the source of truth; the code follows it.
- **Turns:** each player has 15 seconds to call trump or play a card. If time
  runs out, the server plays for them.
- **Dropped connections:** a seat is held for 60 seconds, then a bot plays it
  until the player returns. A reload puts you back in the same seat with the
  same hand.
- **After a match:** the room becomes a lobby again under the same code, and
  the host can start another.

## How it is built

A pnpm workspace in strict TypeScript.

| Package             | What it is                                                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `packages/engine`   | The rules as pure functions, with no I/O. Deals, legal moves, scoring, and the view each seat is allowed to see. |
| `packages/protocol` | The messages between browser and server, and their validation.                                                   |
| `apps/server`       | Node and Socket.IO. Holds rooms in memory, runs the timers, and is the only authority on the game.               |
| `apps/web`          | React and Vite. Shows what the server sends; it never decides anything.                                          |
| `apps/e2e`          | Playwright tests that drive four real browsers through whole matches.                                            |

Two things the design is built around:

- **No player is ever sent another player's cards.** The server builds a
  separate view for each seat and sends it to that socket only. An end-to-end
  test records every frame on the wire for all four players and checks it.
- **The server decides everything.** The browser sends "play this card"; the
  server checks the seat, the turn and the rules before anything happens.

## Running it locally

You need Node 22 and pnpm (`corepack enable` will provide the pinned version).

```bash
pnpm install
```

Then, in two terminals:

```bash
pnpm --filter @omi/server dev   # game server on http://localhost:3001
pnpm --filter @omi/web dev      # web page on http://localhost:5173
```

Open http://localhost:5173 in four browser windows (or profiles) to fill a room.

### Settings

The defaults work for local development. The server reads these from the
environment:

| Name           | Default                 | Meaning                                                     |
| -------------- | ----------------------- | ----------------------------------------------------------- |
| `PORT`         | `3001`                  | Port the server listens on.                                 |
| `CORS_ORIGINS` | `http://localhost:5173` | Addresses the web page may be served from, comma-separated. |
| `LOG_LEVEL`    | `info`                  | pino log level.                                             |
| `TRUST_PROXY`  | `false`                 | Set to `true` only behind a reverse proxy you control.      |

The web page takes `VITE_SERVER_URL` (default `http://localhost:3001`) at build
time.

## Tests

```bash
pnpm verify   # formatting, lint, types, and the unit and integration tests
pnpm e2e      # the end-to-end suite; about 10 minutes
```

`pnpm e2e` builds the web page, starts its own servers on ports 3101 and 4173,
and runs in Chromium, with a shorter set in Firefox and WebKit. The browsers
are installed once with:

```bash
pnpm --filter @omi/e2e exec playwright install
```

## Deployment

The server runs on Render and the web page on Cloudflare Pages. The steps and
settings are in [docs/deployment.md](docs/deployment.md).

## Limits to know about

- Rooms are held in the server's memory. Restarting the server ends every match
  in progress, and the server cannot be run as more than one instance.
- There are no accounts. A player is known by a session token kept in their
  browser, valid for one room.
- A player the host removes from a lobby is not banned and can rejoin with the
  code.

## Design

The screens were designed before they were built. The approved boards are kept
in [docs/design](docs/design) as a visual reference.
