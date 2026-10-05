import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  actOnTurn,
  createHarness,
  errorOf,
  mustOk,
  SOCKETS,
  socketOnTurn,
  startMatch,
  TEST_TIMINGS,
  type Harness,
  type Table,
} from './harness';

const { turnMs, holdMs, botDelayMs, roundPauseMs } = TEST_TIMINGS;
const BAD_TOKEN = 'x'.repeat(43);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const started = (): { harness: Harness; table: Table } => {
  const harness = createHarness();
  return { harness, table: startMatch(harness) };
};

const sessionOf = (table: Table, socketId: string) => {
  const session = table.sessions[SOCKETS.indexOf(socketId as (typeof SOCKETS)[number])];
  if (!session) throw new Error(`No session for ${socketId}`);
  return session;
};

const playerIn = (harness: Harness, watcher: string, playerId: string) => {
  const found = harness.room(watcher).players.find((player) => player.id === playerId);
  if (!found) throw new Error('Player not in room');
  return found;
};

/** A socket that is not on turn, so dropping it does not disturb the turn timer. */
const idleSocket = (harness: Harness): string => {
  const acting = socketOnTurn(harness);
  return SOCKETS.find((socketId) => socketId !== acting) as string;
};

const watcherOther = (...gone: string[]): string =>
  SOCKETS.find((socketId) => !gone.includes(socketId)) as string;

describe('disconnecting during a match', () => {
  test('holds the seat and shows the player as disconnected, not as a bot', () => {
    const { harness, table } = started();
    const gone = idleSocket(harness);

    harness.service.disconnect(gone);

    const player = playerIn(harness, watcherOther(gone), sessionOf(table, gone).playerId);
    expect(player).toMatchObject({ isConnected: false, isBot: false });
    expect(player.seat).not.toBeNull();
  });

  test('leaves the turn timer running for a disconnected player on turn', () => {
    const { harness } = started();
    const gone = socketOnTurn(harness);
    const watcher = watcherOther(gone);

    harness.service.disconnect(gone);
    vi.advanceTimersByTime(turnMs - 1);
    expect(harness.game(watcher).seq).toBe(0);

    vi.advanceTimersByTime(1);
    expect(harness.game(watcher).seq).toBe(1);
  });

  test('treats leaving mid-match the same way, so the seat can be taken back', () => {
    const { harness, table } = started();
    const gone = idleSocket(harness);

    mustOk(harness.service.leave(gone));

    const session = sessionOf(table, gone);
    expect(playerIn(harness, watcherOther(gone), session.playerId).isConnected).toBe(false);
    expect(harness.service.resume('new', { code: session.code, token: session.token }).ok).toBe(
      true,
    );
  });
});

describe('reconnecting', () => {
  test('rebinds the seat to the new socket and sends it the current state', () => {
    const { harness, table } = started();
    const gone = idleSocket(harness);
    const session = sessionOf(table, gone);
    const hand = harness.game(gone).view.hand;
    harness.service.disconnect(gone);

    const resumed = mustOk(
      harness.service.resume('new', { code: session.code, token: session.token }),
    );

    expect(resumed).toEqual({ code: session.code, playerId: session.playerId });
    expect(harness.game('new').view.hand).toEqual(hand);
    expect(harness.room('new')).toMatchObject({ youId: session.playerId });
    expect(playerIn(harness, 'new', session.playerId)).toMatchObject({ isConnected: true });
  });

  test('never sends the token back', () => {
    const { harness, table } = started();
    const gone = idleSocket(harness);
    const session = sessionOf(table, gone);
    harness.service.disconnect(gone);

    const ack = harness.service.resume('new', { code: session.code, token: session.token });

    expect(JSON.stringify(ack)).not.toContain(session.token);
  });

  test('lets the returning player act from the new socket only', () => {
    const { harness, table } = started();
    const acting = socketOnTurn(harness);
    const session = sessionOf(table, acting);
    harness.service.disconnect(acting);
    mustOk(harness.service.resume('new', { code: session.code, token: session.token }));

    expect(errorOf(harness.service.callTrump(acting, { seq: 0, suit: 'hearts' }))).toBe(
      'not-in-room',
    );
    expect(harness.service.callTrump('new', { seq: 0, suit: 'hearts' }).ok).toBe(true);
  });

  test('takes the seat over from a socket that is still connected', () => {
    const { harness, table } = started();
    const acting = socketOnTurn(harness);
    const session = sessionOf(table, acting);

    mustOk(harness.service.resume('new', { code: session.code, token: session.token }));

    expect(errorOf(harness.service.callTrump(acting, { seq: 0, suit: 'hearts' }))).toBe(
      'not-in-room',
    );
    expect(harness.service.callTrump('new', { seq: 0, suit: 'hearts' }).ok).toBe(true);
  });

  test('gives the same answer for a wrong token and for an unknown room', () => {
    const { harness, table } = started();

    const wrongToken = harness.service.resume('new', { code: table.code, token: BAD_TOKEN });
    const wrongRoom = harness.service.resume('new', {
      code: 'ZZZZZZ',
      token: sessionOf(table, 's1').token,
    });

    expect(errorOf(wrongToken)).toBe('session-invalid');
    expect(wrongRoom).toEqual(wrongToken);
  });

  test('is refused for a socket that already holds a seat', () => {
    const { harness, table } = started();
    const session = sessionOf(table, 's1');

    expect(
      errorOf(harness.service.resume('s0', { code: session.code, token: session.token })),
    ).toBe('already-in-room');
  });
});

describe('bot takeover', () => {
  test('happens once the hold time runs out', () => {
    const { harness, table } = started();
    const gone = idleSocket(harness);
    const watcher = watcherOther(gone);
    harness.service.disconnect(gone);

    vi.advanceTimersByTime(holdMs - 1);
    expect(playerIn(harness, watcher, sessionOf(table, gone).playerId).isBot).toBe(false);

    vi.advanceTimersByTime(1);
    expect(playerIn(harness, watcher, sessionOf(table, gone).playerId).isBot).toBe(true);
  });

  test('does not happen if the player returns within the hold time', () => {
    const { harness, table } = started();
    const gone = idleSocket(harness);
    const session = sessionOf(table, gone);
    harness.service.disconnect(gone);
    vi.advanceTimersByTime(holdMs - 1);

    mustOk(harness.service.resume('new', { code: session.code, token: session.token }));
    vi.advanceTimersByTime(holdMs);

    expect(playerIn(harness, 'new', session.playerId).isBot).toBe(false);
  });

  test('plays the bot’s turn after the bot delay, with no deadline shown', () => {
    const { harness } = started();
    const gone = socketOnTurn(harness);
    const others = SOCKETS.filter((socketId) => socketId !== gone);
    const watcher = others[0] as string;
    harness.service.disconnect(gone);

    // The hold (60 s) outlasts several turn timeouts; keep the others acting
    // until the hold has expired and the seat is a bot.
    vi.advanceTimersByTime(holdMs);
    while (harness.game(watcher).view.turn !== harness.game(gone).view.seat) {
      if (harness.game(watcher).view.turn === null) vi.advanceTimersByTime(roundPauseMs);
      else mustOk(actOnTurn(harness, others));
    }
    const { seq, deadline } = harness.game(watcher);

    expect(deadline).toBeNull();
    vi.advanceTimersByTime(botDelayMs - 1);
    expect(harness.game(watcher).seq).toBe(seq);
    vi.advanceTimersByTime(1);
    expect(harness.game(watcher).seq).toBe(seq + 1);
  });

  test('gives the seat back when the player returns, and stops the bot acting for them', () => {
    const { harness, table } = started();
    const gone = socketOnTurn(harness);
    const session = sessionOf(table, gone);
    const others = SOCKETS.filter((socketId) => socketId !== gone);
    const watcher = others[0] as string;
    harness.service.disconnect(gone);
    vi.advanceTimersByTime(holdMs);
    while (harness.game(watcher).view.turn !== harness.game(gone).view.seat) {
      if (harness.game(watcher).view.turn === null) vi.advanceTimersByTime(roundPauseMs);
      else mustOk(actOnTurn(harness, others));
    }

    mustOk(harness.service.resume('new', { code: session.code, token: session.token }));
    const { seq, deadline } = harness.game('new');

    expect(playerIn(harness, 'new', session.playerId)).toMatchObject({
      isBot: false,
      isConnected: true,
    });
    expect(deadline).toBe(Date.now() + turnMs);
    vi.advanceTimersByTime(botDelayMs);
    expect(harness.game('new').seq).toBe(seq);
  });

  test('keeps a match going to the end with one human left', () => {
    const { harness } = started();
    for (const socketId of ['s1', 's2', 's3']) harness.service.disconnect(socketId);

    for (let step = 0; step < 4000 && harness.room('s0').status === 'playing'; step += 1) {
      vi.advanceTimersByTime(turnMs);
    }

    expect(harness.room('s0').status).toBe('finished');
    expect(harness.room('s0').players.filter((player) => player.isBot)).toHaveLength(3);
  });
});

describe('room expiry', () => {
  test('removes the room the moment the last connected human goes', () => {
    const { harness, table } = started();

    for (const socketId of SOCKETS) harness.service.disconnect(socketId);

    expect(harness.store.find(table.code)).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  test('keeps the room while one human is still connected', () => {
    const { harness, table } = started();

    for (const socketId of ['s1', 's2', 's3']) harness.service.disconnect(socketId);

    expect(harness.store.find(table.code)).toBeDefined();
  });

  test('removes the room when the last human leaves and only bots remain', () => {
    const { harness, table } = started();
    for (const socketId of ['s1', 's2', 's3']) harness.service.disconnect(socketId);
    vi.advanceTimersByTime(holdMs);

    harness.service.disconnect('s0');

    expect(harness.store.find(table.code)).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  test('makes a removed room’s sessions invalid', () => {
    const { harness, table } = started();
    for (const socketId of SOCKETS) harness.service.disconnect(socketId);

    const session = sessionOf(table, 's0');

    expect(
      errorOf(harness.service.resume('new', { code: session.code, token: session.token })),
    ).toBe('session-invalid');
  });
});
