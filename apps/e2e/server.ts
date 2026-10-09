import { DEFAULT_RULES, seedFromInteger, type Seed } from '@omi/engine';
import { createOmiServer } from '@omi/server';
import pino from 'pino';
import { HOLD_SECONDS, SERVER_PORT, WEB_URL } from './support/settings';

// The game server as the end-to-end tests run it. It differs from the real
// entry point (apps/server/src/main.ts) in ways that would be unsafe or
// unhelpful anywhere else: every deal is predictable, and the limits are loose
// because all four browsers connect from one address.

const MS_PER_SECOND = 1000;
const FIRST_SEED = 2026;

/** Seeds 2026, 2027, 2028… so a run deals the same cards every time. */
const fixedSeeds = (): (() => Seed) => {
  let next = FIRST_SEED;
  return () => {
    const seed = seedFromInteger(next);
    next += 1;
    return seed;
  };
};

const logger = pino({ level: process.env.E2E_LOG_LEVEL ?? 'warn' });

const server = createOmiServer({
  corsOrigins: [WEB_URL],
  logger,
  newSeed: fixedSeeds(),
  rules: { ...DEFAULT_RULES, reconnectHoldSeconds: HOLD_SECONDS },
  timings: {
    turnMs: DEFAULT_RULES.turnTimerSeconds * MS_PER_SECOND,
    holdMs: HOLD_SECONDS * MS_PER_SECOND,
    lobbyHoldMs: 30 * MS_PER_SECOND,
    roundPauseMs: 5 * MS_PER_SECOND,
    botDelayMs: 300,
    idleRoomMs: 600 * MS_PER_SECOND,
  },
  limits: {
    perSocket: { capacity: 200, refillPerSecond: 100 },
    perAddress: { capacity: 500, refillPerSecond: 50 },
    resume: { capacity: 100, refillPerSecond: 10 },
  },
  maxConnectionsPerAddress: 64,
});

server.httpServer.listen(SERVER_PORT, () => {
  logger.warn({ port: SERVER_PORT }, 'omi test server listening, with fixed seeds');
});

const stop = (): void => {
  void server.close().finally(() => process.exit(0));
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
