import { DEFAULT_RULES } from '@omi/engine';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  TEST_TIMINGS,
  actOnTurn,
  createHarness,
  errorOf,
  fillRoom,
  mustOk,
  startMatch,
} from './harness';

const { lobbyHoldMs, holdMs, roundPauseMs, turnMs } = TEST_TIMINGS;
const ONE_ROUND_MATCH = { ...DEFAULT_RULES, tokenTarget: 1 };

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const inLobby = () => {
  const harness = createHarness();
  const table = fillRoom(harness);
  return { harness, ...table };
};

describe('a connection that drops in the lobby', () => {
  test('keeps the player’s place, shown as away with the time they have', () => {
    const { harness, sessions } = inLobby();

    harness.service.disconnect('s2');

    const room = harness.room('s0');
    expect(room.players).toHaveLength(4);
    expect(room.players.find((player) => player.id === sessions[2]?.playerId)).toMatchObject({
      isConnected: false,
      isBot: false,
      holdDeadline: Date.now() + lobbyHoldMs,
    });
  });

  test('is forgotten when the player comes back in time', () => {
    const { harness, code, sessions } = inLobby();
    harness.service.disconnect('s2');
    vi.advanceTimersByTime(lobbyHoldMs - 1);

    mustOk(harness.service.resume('s2-again', { code, token: sessions[2]?.token as string }));
    vi.advanceTimersByTime(lobbyHoldMs);

    const room = harness.room('s0');
    expect(room.players).toHaveLength(4);
    expect(room.players.every((player) => player.isConnected && player.holdDeadline === null)).toBe(
      true,
    );
  });

  test('costs the player their place once the time runs out', () => {
    const { harness, code, sessions } = inLobby();
    harness.service.disconnect('s2');

    vi.advanceTimersByTime(lobbyHoldMs);

    expect(harness.room('s0').players.map((player) => player.id)).toEqual([
      sessions[0]?.playerId,
      sessions[1]?.playerId,
      sessions[3]?.playerId,
    ]);
    const ack = harness.service.resume('s2-again', { code, token: sessions[2]?.token as string });
    expect(errorOf(ack)).toBe('session-invalid');
  });

  test('is different from leaving, which gives the place up at once', () => {
    const { harness } = inLobby();

    mustOk(harness.service.leave('s2'));

    expect(harness.room('s0').players).toHaveLength(3);
    expect(vi.getTimerCount()).toBe(1); // only the idle timer
  });

  test('still removes the room at once when nobody is left connected', () => {
    const harness = createHarness();
    const { code } = mustOk(harness.service.createRoom('s0', { name: 'P0' }));

    harness.service.disconnect('s0');

    expect(harness.store.find(code)).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('while a player is away', () => {
  test('the host cannot start, and can once they are back', () => {
    const { harness, code, sessions } = inLobby();
    harness.service.disconnect('s3');

    expect(errorOf(harness.service.start('s0'))).toBe('player-away');

    mustOk(harness.service.resume('s3-again', { code, token: sessions[3]?.token as string }));
    mustOk(harness.service.start('s0'));
    expect(harness.room('s3-again').status).toBe('playing');
  });

  test('the host can remove them, and their timer goes with them', () => {
    const { harness, code, sessions } = inLobby();
    harness.service.disconnect('s3');

    mustOk(harness.service.kick('s0', { playerId: sessions[3]?.playerId as string }));
    const sentBefore = harness.sent.length;
    vi.advanceTimersByTime(lobbyHoldMs);

    expect(harness.room('s0').players).toHaveLength(3);
    expect(harness.sent).toHaveLength(sentBefore);
    const ack = harness.service.resume('s3-again', { code, token: sessions[3]?.token as string });
    expect(errorOf(ack)).toBe('session-invalid');
  });

  test('a host who is away stays host until their time runs out', () => {
    const { harness, sessions } = inLobby();

    harness.service.disconnect('s0');
    expect(harness.room('s1').players.map((player) => player.isHost)).toEqual([
      true,
      false,
      false,
      false,
    ]);
    expect(errorOf(harness.service.start('s1'))).toBe('not-host');

    vi.advanceTimersByTime(lobbyHoldMs);
    expect(harness.room('s1').players.map((player) => player.id)).toEqual([
      sessions[1]?.playerId,
      sessions[2]?.playerId,
      sessions[3]?.playerId,
    ]);
    expect(harness.room('s1').players[0]?.isHost).toBe(true);
  });

  test('their place still counts, so nobody else can take it', () => {
    const { harness, code } = inLobby();
    harness.service.disconnect('s3');

    expect(errorOf(harness.service.joinRoom('s4', { code, name: 'New' }))).toBe('room-full');
  });
});

describe('when a match ends with a player away', () => {
  /** Plays the one-round match out with the sockets that are still connected. */
  const finish = (
    harness: ReturnType<typeof createHarness>,
    sockets: readonly string[],
    watcher: string,
  ): void => {
    for (let step = 0; step < 400 && harness.room(watcher).status === 'playing'; step += 1) {
      const isHumanTurn = sockets.some((socketId) => {
        const { view } = harness.game(socketId);
        return view.turn === view.seat;
      });
      if (harness.game(watcher).view.turn === null) vi.advanceTimersByTime(roundPauseMs);
      else if (isHumanTurn) mustOk(actOnTurn(harness, sockets));
      else vi.advanceTimersByTime(turnMs);
    }
    expect(harness.room(watcher).status).toBe('lobby');
  };

  test('one whose seat was still held keeps a place in the lobby, with a fresh hold', () => {
    const harness = createHarness({
      rules: ONE_ROUND_MATCH,
      // Long enough that the seat is still held when the match ends.
      timings: { ...TEST_TIMINGS, holdMs: 3_600_000 },
    });
    const { code, sessions } = startMatch(harness);
    harness.service.disconnect('s3');

    finish(harness, ['s0', 's1', 's2'], 's0');

    const away = harness.room('s0').players.find((player) => player.id === sessions[3]?.playerId);
    expect(away).toMatchObject({
      isConnected: false,
      isBot: false,
      seat: null,
      holdDeadline: Date.now() + lobbyHoldMs,
    });
    mustOk(harness.service.resume('s3-again', { code, token: sessions[3]?.token as string }));
    expect(harness.room('s3-again').players).toHaveLength(4);
  });

  test('and loses it if they do not return within that hold', () => {
    const harness = createHarness({
      rules: ONE_ROUND_MATCH,
      timings: { ...TEST_TIMINGS, holdMs: 3_600_000 },
    });
    startMatch(harness);
    harness.service.disconnect('s3');
    finish(harness, ['s0', 's1', 's2'], 's0');

    vi.advanceTimersByTime(lobbyHoldMs);

    expect(harness.room('s0').players).toHaveLength(3);
    expect(vi.getTimerCount()).toBe(1); // only the idle timer
  });

  test('one whose seat a bot had taken is removed', () => {
    const harness = createHarness({ rules: ONE_ROUND_MATCH });
    const { sessions } = startMatch(harness);
    harness.service.disconnect('s3');
    vi.advanceTimersByTime(holdMs);

    finish(harness, ['s0', 's1', 's2'], 's0');

    expect(harness.room('s0').players.map((player) => player.id)).not.toContain(
      sessions[3]?.playerId,
    );
  });
});
