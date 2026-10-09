import { DEFAULT_RULES } from '@omi/engine';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  createHarness,
  errorOf,
  fillRoom,
  mustOk,
  playRound,
  startMatch,
  TEST_TIMINGS,
  type Harness,
} from './harness';

const { idleRoomMs, roundPauseMs } = TEST_TIMINGS;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const idOf = (harness: Harness, socketId: string): string => harness.room(socketId).youId;

const closedFor = (harness: Harness, socketId: string): unknown[] =>
  harness.sent
    .filter((each) => each.socketId === socketId && each.event === 'room:closed')
    .map((each) => each.payload);

const finishMatch = (harness: Harness): void => {
  for (let round = 0; round < 60 && harness.room('s0').status === 'playing'; round += 1) {
    playRound(harness);
    vi.advanceTimersByTime(roundPauseMs);
  }
};

describe('kicking a player from the lobby', () => {
  test('removes the player and tells everyone left', () => {
    const harness = createHarness();
    fillRoom(harness);
    const target = idOf(harness, 's2');

    mustOk(harness.service.kick('s0', { playerId: target }));

    expect(harness.room('s0').players.map((player) => player.name)).toEqual(['P0', 'P1', 'P3']);
    expect(harness.room('s1').players).toHaveLength(3);
  });

  test('tells the kicked socket why its room has gone, and sends it nothing more', () => {
    const harness = createHarness();
    fillRoom(harness);
    const target = idOf(harness, 's2');

    mustOk(harness.service.kick('s0', { playerId: target }));
    mustOk(harness.service.leave('s3'));

    expect(closedFor(harness, 's2')).toEqual(['kicked']);
    expect(harness.sent.at(-1)?.socketId).not.toBe('s2');
    expect(harness.room('s2').players).toHaveLength(4);
  });

  test('frees the kicked socket, which is no longer in the room', () => {
    const harness = createHarness();
    fillRoom(harness);

    mustOk(harness.service.kick('s0', { playerId: idOf(harness, 's2') }));

    expect(errorOf(harness.service.leave('s2'))).toBe('not-in-room');
    expect(harness.service.createRoom('s2', { name: 'P2' }).ok).toBe(true);
  });

  test('opens the seat for someone else', () => {
    const harness = createHarness();
    const { code } = fillRoom(harness);

    mustOk(harness.service.kick('s0', { playerId: idOf(harness, 's2') }));

    expect(harness.service.joinRoom('s4', { code, name: 'Friend' }).ok).toBe(true);
    expect(harness.service.start('s0').ok).toBe(true);
  });

  test('is refused for anyone but the host', () => {
    const harness = createHarness();
    fillRoom(harness);

    expect(errorOf(harness.service.kick('s1', { playerId: idOf(harness, 's2') }))).toBe('not-host');
  });

  test('is refused when the host names themselves', () => {
    const harness = createHarness();
    fillRoom(harness);

    expect(errorOf(harness.service.kick('s0', { playerId: idOf(harness, 's0') }))).toBe(
      'cannot-kick-self',
    );
  });

  test('is refused for a player who is not in the room', () => {
    const harness = createHarness();
    fillRoom(harness);

    expect(errorOf(harness.service.kick('s0', { playerId: 'A'.repeat(16) }))).toBe(
      'player-not-found',
    );
  });

  test('is refused once the match has started', () => {
    const harness = createHarness();
    startMatch(harness);

    expect(errorOf(harness.service.kick('s0', { playerId: idOf(harness, 's2') }))).toBe(
      'match-in-progress',
    );
  });

  test('is refused for a socket that is not in a room', () => {
    expect(errorOf(createHarness().service.kick('s9', { playerId: 'A'.repeat(16) }))).toBe(
      'not-in-room',
    );
  });
});

describe('idle rooms', () => {
  test('a lobby that is never started is removed after the idle time', () => {
    const harness = createHarness();
    const { code } = fillRoom(harness);

    vi.advanceTimersByTime(idleRoomMs - 1);
    expect(harness.store.find(code)).toBeDefined();

    vi.advanceTimersByTime(1);
    expect(harness.store.find(code)).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  test('everyone in an expired room is told, and is free to start again', () => {
    const harness = createHarness();
    fillRoom(harness);

    vi.advanceTimersByTime(idleRoomMs);

    for (const socketId of ['s0', 's1', 's2', 's3']) {
      expect(closedFor(harness, socketId)).toEqual(['expired']);
    }
    expect(harness.service.createRoom('s0', { name: 'P0' }).ok).toBe(true);
  });

  test('the idle time starts again whenever someone joins, leaves or is kicked', () => {
    const harness = createHarness();
    const { code } = mustOk(harness.service.createRoom('s0', { name: 'P0' }));

    vi.advanceTimersByTime(idleRoomMs - 1);
    mustOk(harness.service.joinRoom('s1', { code, name: 'P1' }));
    vi.advanceTimersByTime(idleRoomMs - 1);
    mustOk(harness.service.joinRoom('s2', { code, name: 'P2' }));
    vi.advanceTimersByTime(idleRoomMs - 1);
    mustOk(harness.service.kick('s0', { playerId: harness.room('s2').youId }));
    vi.advanceTimersByTime(idleRoomMs - 1);
    mustOk(harness.service.leave('s1'));
    vi.advanceTimersByTime(idleRoomMs - 1);

    expect(harness.store.find(code)).toBeDefined();
    expect(vi.getTimerCount()).toBe(1);
  });

  test('a match in progress is never removed for being idle', () => {
    const harness = createHarness({ timings: { ...TEST_TIMINGS, turnMs: idleRoomMs * 3 } });
    const { code } = startMatch(harness);

    vi.advanceTimersByTime(idleRoomMs * 2);

    expect(harness.store.find(code)?.status).toBe('playing');
  });

  test('after a match, the lobby is removed after the idle time, and its players are told', () => {
    const harness = createHarness({ rules: { ...DEFAULT_RULES, tokenTarget: 1 } });
    const { code } = startMatch(harness);
    finishMatch(harness);
    expect(harness.room('s0').status).toBe('lobby');

    vi.advanceTimersByTime(idleRoomMs - roundPauseMs - 1);
    expect(harness.store.find(code)).toBeDefined();

    vi.advanceTimersByTime(roundPauseMs + 1);
    expect(harness.store.find(code)).toBeUndefined();
    expect(closedFor(harness, 's1')).toEqual(['expired']);
    expect(vi.getTimerCount()).toBe(0);
  });
});
