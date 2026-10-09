// Ports of their own, so a run never collides with the dev servers on 3001 and 5173.
export const SERVER_PORT = 3101;
export const WEB_PORT = 4173;

export const SERVER_URL = `http://localhost:${SERVER_PORT}`;
export const WEB_URL = `http://localhost:${WEB_PORT}`;

/**
 * How long the test server holds a seat before a bot takes it. The rules say 60
 * seconds; a short hold keeps the bot-takeover test from sitting idle.
 */
export const HOLD_SECONDS = 5;
