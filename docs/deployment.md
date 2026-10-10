# Deployment

The game runs as two pieces: the game server on Render and the web page on
Cloudflare Pages. Both deploy from the `main` branch of the GitHub repo.

## What the free server plan means

Render's free plan stops the server after 15 minutes with no request and no
WebSocket message, and takes about a minute to start it again. Rooms live in
the server's memory, so a room that was open when it stopped is gone. A match
in progress keeps the server awake. The Starter plan ($7 a month) never stops;
switching is a setting in the Render dashboard and needs no code change.

## First deploy

The two pieces need each other's address, so it takes three steps.

1. **Render (server).** New → Blueprint → pick this repo. It reads
   `render.yaml`. When asked for `CORS_ORIGINS`, enter `https://example.com`
   for now. Wait for the deploy, then note the service address, for example
   `https://omi-server.onrender.com`. Opening `<address>/health` should show
   `{"status":"ok"}`.
2. **Cloudflare Pages (web page).** Workers & Pages → Create → Pages → connect
   this repo, with:
   - Build command: `pnpm install --frozen-lockfile && pnpm --filter @omi/web build`
   - Build output directory: `apps/web/dist`
   - Environment variables: `NODE_VERSION` = `22`, and `VITE_SERVER_URL` = the
     Render address from step 1 (no trailing slash)

   Note the page address, for example `https://omi.pages.dev`.
3. **Render again.** In the service's Environment tab, set `CORS_ORIGINS` to
   the Pages address from step 2 (no trailing slash) and save. Render redeploys.

## Settings

| Where | Name | Value |
|---|---|---|
| Render | `CORS_ORIGINS` | The web page's address. Several can be given, separated by commas. |
| Render | `TRUST_PROXY` | `true` (set by `render.yaml`) |
| Cloudflare Pages | `VITE_SERVER_URL` | The server's address. It is built into the page, so changing it needs a new build. |

The page's security headers come from `apps/web/public/_headers`, and room
links such as `/r/ABC234` are served by `apps/web/public/_redirects`.

## Checks after a deploy

- `curl -I <page address>` lists `content-security-policy: frame-ancestors 'none'`.
- `<page address>/r/ABC234` shows the join form, not a "not found" page.
- Four browsers can join one room and play a round, and the browser console
  shows no Content-Security-Policy or CORS errors.
- Players on different networks can all connect. The server allows 12
  connections per address; if people are refused once about a dozen are
  online, the server is seeing Render's proxy as everyone's address.

## Things to leave off

Cloudflare's Web Analytics and similar features inject a script into the page.
The page's Content-Security-Policy blocks any script it did not ship itself,
so they would not work and would log an error.
