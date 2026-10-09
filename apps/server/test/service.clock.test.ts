import { DEFAULT_RULES } from '@omi/engine';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  createHarness,
  mustOk,
  playRound,
  SOCKETS,
  socketOnTurn,
  startMatch,
  TEST_TIMINGS,
  type Harness,
} from './harness';

const { holdMs, lobbyHoldMs, roundPauseMs } = TEST_TIMINGS;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const idleSocket = (harness: Harness): string => {
  const acting = socketOnTurn(harness);
  return SOCKETS.find((socketId) => socketId !== acting) as string;
};

const watcherOf = (gone: string): string => SOCKETS.find((socketId) => socketId !== gone) as string;

const holdOf = (harness: Harness, watcher: string, playerId: string): number | null | undefined =>
  harness.room(watcher).players.find((player) => player.id === playerId)?.holdDeadline;

describe('server time', () => {
  test('is on every room and game snapshot, so clients can correct their clocks', () => {
    const harness = createHarness();
    vi.setSystemTime(1_700_000_000_000);

    startMatch(harness);

    expect(harness.room('s0').serverNow).toBe(1_700_000_000_000);
    expect(harness.game('s0').serverNow).toBe(1_700_000_000_000);
  });
});

describe('the pause between rounds', () => {
  test('tells players when the next round will be dealt', () => {
    const harness = createHarness();
    startMatch(harness);

    playRound(harness);

    expect(harness.game('s0').view.phase).toBe('round-scored');
    expect(harness.game('s0').deadline).toBe(Date.now() + roundPauseMs);
  });

  test('gives no deadline once the match is over', () => {
    const harness = createHarness({ rules: { ...DEFAULT_RULES, tokenTarget: 1 } });
    startMatch(harness);
    for (let round = 0; round < 60 && harness.room('s0').status === 'playing'; round += 1) {
      playRound(harness);
      vi.advanceTimersByTime(roundPauseMs);
    }

    expect(harness.game('s0').view.phase).toBe('match-over');
    expect(harness.game('s0').deadline).toBeNull();
  });
});

describe('the hold deadline of a disconnected player', () => {
  test('is null for everyone who is connected', () => {
    const harness = createHarness();
    startMatch(harness);

    expect(harness.room('s0').players.map((player) => player.holdDeadline)).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });

  test('says when a bot will take the seat', () => {
    const harness = createHarness();
    const table = startMatch(harness);
    const gone = idleSocket(harness);
    const goneId = table.sessions[SOCKETS.indexOf(gone as (typeof SOCKETS)[number])]?.playerId;

    harness.service.disconnect(gone);

    expect(holdOf(harness, watcherOf(gone), goneId as string)).toBe(Date.now() + holdMs);
  });

  test('is cleared when the player returns', () => {
    const harness = createHarness();
    const table = startMatch(harness);
    const gone = idleSocket(harness);
    const session = table.sessions[SOCKETS.indexOf(gone as (typeof SOCKETS)[number])];
    if (!session) throw new Error('No session');
    harness.service.disconnect(gone);

    mustOk(harness.service.resume('new', { code: session.code, token: session.token }));

    expect(holdOf(harness, 'new', session.playerId)).toBeNull();
  });

  test('is cleared once the bot has taken over', () => {
    const harness = createHarness();
    const table = startMatch(harness);
    const gone = idleSocket(harness);
    const goneId = table.sessions[SOCKETS.indexOf(gone as (typeof SOCKETS)[number])]?.playerId;
    harness.service.disconnect(gone);

    vi.advanceTimersByTime(holdMs);

    const player = harness.room(watcherOf(gone)).players.find((each) => each.id === goneId);
    expect(player).toMatchObject({ isBot: true, holdDeadline: null });
  });

  test('after the match is the shorter hold of the lobby', () => {
    const harness = createHarness({ rules: { ...DEFAULT_RULES, tokenTarget: 1 } });
    const table = startMatch(harness);
    for (let round = 0; round < 60 && harness.room('s0').status === 'playing'; round += 1) {
      playRound(harness);
      vi.advanceTimersByTime(roundPauseMs);
    }

    harness.service.disconnect('s3');

    expect(harness.room('s0').players).toHaveLength(4);
    expect(holdOf(harness, 's0', table.sessions[3]?.playerId as string)).toBe(
      Date.now() + lobbyHoldMs,
    );
  });
});
