import { DEFAULT_RULES } from '@omi/engine';
import pino from 'pino';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  actOnTurn,
  createHarness,
  errorOf,
  mustOk,
  playRound,
  SOCKETS,
  socketOnTurn,
  startMatch,
  TEST_TIMINGS,
  type Harness,
  type Table,
} from './harness';

const { turnMs, holdMs, botDelayMs, roundPauseMs } = TEST_TIMINGS;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const started = (options: Parameters<typeof createHarness>[0] = {}) => {
  const harness = createHarness(options);
  return { harness, table: startMatch(harness) };
};

const sessionOf = (table: Table, socketId: string) => {
  const session = table.sessions[SOCKETS.indexOf(socketId as (typeof SOCKETS)[number])];
  if (!session) throw new Error(`No session for ${socketId}`);
  return session;
};

const idleSocket = (harness: Harness): string => {
  const acting = socketOnTurn(harness);
  return SOCKETS.find((socketId) => socketId !== acting) as string;
};

const others = (...gone: string[]): string[] =>
  SOCKETS.filter((socketId) => !gone.includes(socketId));

const resume = (harness: Harness, table: Table, original: string, socketId: string) => {
  const session = sessionOf(table, original);
  return harness.service.resume(socketId, { code: session.code, token: session.token });
};

describe('hold timers', () => {
  test('are cancelled when the player returns', () => {
    const { harness, table } = started();
    const gone = idleSocket(harness);
    harness.service.disconnect(gone);
    expect(vi.getTimerCount()).toBe(2);

    mustOk(resume(harness, table, gone, 'new'));

    expect(vi.getTimerCount()).toBe(1);
  });

  test('do not pile up when a player drops and returns repeatedly', () => {
    const { harness, table } = started();
    const gone = idleSocket(harness);
    let current = gone;

    for (let cycle = 0; cycle < 5; cycle += 1) {
      harness.service.disconnect(current);
      expect(vi.getTimerCount()).toBe(2);
      current = `back-${cycle}`;
      mustOk(resume(harness, table, gone, current));
      expect(vi.getTimerCount()).toBe(1);
    }
  });

  test('replace the turn timer with the bot delay when they expire on the held player’s turn', () => {
    // A turn longer than the hold, so the hold runs out while the turn is still open.
    const { harness } = started({ timings: { ...TEST_TIMINGS, turnMs: holdMs * 3 } });
    const gone = socketOnTurn(harness);
    const [watcher] = others(gone) as [string];
    harness.service.disconnect(gone);

    vi.advanceTimersByTime(holdMs);
    expect(harness.game(watcher).deadline).toBeNull();
    expect(harness.game(watcher).seq).toBe(0);

    vi.advanceTimersByTime(botDelayMs);
    expect(harness.game(watcher).seq).toBe(1);
    expect(vi.getTimerCount()).toBe(1);
  });

  test('are dropped when the match finishes, so nobody is turned into a bot afterwards', () => {
    const { harness } = started({
      rules: { ...DEFAULT_RULES, tokenTarget: 1 },
      timings: { ...TEST_TIMINGS, holdMs: 60 * 60 * 1000 },
    });
    const gone = idleSocket(harness);
    const present = others(gone);
    const [watcher] = present as [string];
    harness.service.disconnect(gone);

    for (let step = 0; step < 2000 && harness.room(watcher).status === 'playing'; step += 1) {
      const { view } = harness.game(watcher);
      if (view.turn === null) vi.advanceTimersByTime(roundPauseMs);
      else if (view.turn === harness.game(gone).view.seat) vi.advanceTimersByTime(turnMs);
      else mustOk(actOnTurn(harness, present));
    }

    expect(harness.room(watcher).status).toBe('lobby');
    // Only the idle timer of the lobby is left.
    expect(vi.getTimerCount()).toBe(1);
    expect(harness.room(watcher).players).toHaveLength(3);
  });
});

describe('returning at other moments', () => {
  test('when it is not the player’s turn, leaves the turn clock alone and tells the others', () => {
    const { harness, table } = started();
    const gone = idleSocket(harness);
    const [watcher] = others(gone) as [string];
    const { deadline } = harness.game(watcher);
    harness.service.disconnect(gone);
    vi.advanceTimersByTime(1000);
    const framesBefore = harness.sent.length;

    mustOk(resume(harness, table, gone, 'new'));

    expect(harness.game('new').deadline).toBe(deadline);
    expect(harness.room(watcher).players.every((player) => player.isConnected)).toBe(true);
    const sentToOthers = harness.sent.slice(framesBefore).filter((each) => each.socketId !== 'new');
    expect(sentToOthers.every((each) => each.event === 'room:state')).toBe(true);
  });

  test('during the pause between rounds, still gets the next deal', () => {
    const { harness, table } = started();
    playRound(harness);
    harness.service.disconnect('s2');

    mustOk(resume(harness, table, 's2', 'new'));
    vi.advanceTimersByTime(roundPauseMs);

    expect(harness.game('new').view).toMatchObject({ phase: 'calling-trump', roundNumber: 2 });
    expect(harness.game('new').view.hand).toHaveLength(4);
  });

  test('a drop during the pause between rounds does not stop the next deal', () => {
    const { harness } = started();
    playRound(harness);

    harness.service.disconnect('s2');
    vi.advanceTimersByTime(roundPauseMs);

    expect(harness.game('s0').view).toMatchObject({ phase: 'calling-trump', roundNumber: 2 });
  });

  test('after the match has ended, the seat is gone and the room must be joined again', () => {
    const { harness, table } = started({ rules: { ...DEFAULT_RULES, tokenTarget: 1 } });
    for (let round = 0; round < 60 && harness.room('s0').status === 'playing'; round += 1) {
      playRound(harness);
      vi.advanceTimersByTime(roundPauseMs);
    }
    harness.service.disconnect('s3');

    expect(errorOf(resume(harness, table, 's3', 'new'))).toBe('session-invalid');
    mustOk(harness.service.joinRoom('new', { code: table.code, name: 'Back' }));

    expect(harness.room('new')).toMatchObject({ status: 'lobby' });
    expect(harness.room('new').players).toHaveLength(4);
  });
});

describe('resuming from a second socket', () => {
  test('tells the displaced socket that it has been replaced', () => {
    const { harness, table } = started();

    mustOk(resume(harness, table, 's1', 'new'));

    expect(
      harness.sent.filter((each) => each.socketId === 's1' && each.event === 'session:replaced'),
    ).toHaveLength(1);
  });

  test('keeps the seat connected when the displaced socket then disconnects', () => {
    const { harness, table } = started();
    mustOk(resume(harness, table, 's1', 'new'));

    harness.service.disconnect('s1');

    const me = harness
      .room('new')
      .players.find((player) => player.id === harness.room('new').youId);
    expect(me).toMatchObject({ isConnected: true, isBot: false });
    expect(vi.getTimerCount()).toBe(1);
  });
});

describe('a step the engine rejects', () => {
  test('is retried instead of leaving the match with no timer', () => {
    const { harness, table } = started();
    const room = harness.store.find(table.code);
    if (!room?.match) throw new Error('No match');
    // Corrupt the stored match so the timeout auto-action has no card to play.
    harness.store.save({
      ...room,
      match: {
        ...room.match,
        phase: 'playing',
        trump: 'hearts',
        currentTrick: { leader: room.match.caller, plays: [] },
        hands: [[], [], [], []],
      },
    });

    vi.advanceTimersByTime(turnMs);

    expect(vi.getTimerCount()).toBe(1);
    expect(harness.store.find(table.code)?.seq).toBe(0);
  });
});

describe('logs', () => {
  test('never contain a room code, a session token or a card', () => {
    const lines: string[] = [];
    const logger = pino({ level: 'trace' }, { write: (line: string) => lines.push(line) });
    const harness = createHarness({ logger });
    const table = startMatch(harness);
    playRound(harness);
    harness.service.disconnect('s3');
    vi.advanceTimersByTime(holdMs);
    for (const socketId of ['s0', 's1', 's2']) harness.service.disconnect(socketId);

    const log = lines.join('\n');

    expect(lines.length).toBeGreaterThan(5);
    expect(log).not.toContain(table.code);
    for (const session of table.sessions) expect(log).not.toContain(session.token);
    expect(log).not.toMatch(/"suit"|"rank"|"rng"|"seed"|tokenHash/);
  });
});
