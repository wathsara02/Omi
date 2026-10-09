import { DEFAULT_RULES } from '@omi/engine';
import { resumeSchema } from '@omi/protocol';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createHarness, errorOf, fillRoom, mustOk, SOCKETS, startMatch } from './harness';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('creating a room', () => {
  test('returns a session the protocol accepts and makes the creator host', () => {
    const harness = createHarness();

    const session = mustOk(harness.service.createRoom('s0', { name: 'Nimal' }));

    expect(resumeSchema.safeParse({ code: session.code, token: session.token }).success).toBe(true);
    expect(harness.room('s0')).toMatchObject({
      code: session.code,
      status: 'lobby',
      youId: session.playerId,
      players: [{ id: session.playerId, name: 'Nimal', isHost: true, isConnected: true }],
    });
  });

  test('keeps only a hash of the session token', () => {
    const harness = createHarness();

    const session = mustOk(harness.service.createRoom('s0', { name: 'Nimal' }));

    const stored = harness.store.find(session.code);
    expect(JSON.stringify(stored)).not.toContain(session.token);
    expect(JSON.stringify(harness.sent)).not.toContain(session.token);
  });

  test('is refused for a socket that is already in a room', () => {
    const harness = createHarness();
    mustOk(harness.service.createRoom('s0', { name: 'Nimal' }));

    expect(errorOf(harness.service.createRoom('s0', { name: 'Nimal' }))).toBe('already-in-room');
  });

  test('is refused once the server holds its maximum number of rooms', () => {
    const harness = createHarness({ maxRooms: 1 });
    mustOk(harness.service.createRoom('s0', { name: 'Nimal' }));

    expect(errorOf(harness.service.createRoom('s1', { name: 'Kamala' }))).toBe('server-full');
  });
});

describe('joining a room', () => {
  test('adds the player and tells everyone in the room', () => {
    const harness = createHarness();
    const host = mustOk(harness.service.createRoom('s0', { name: 'Nimal' }));

    const joined = mustOk(harness.service.joinRoom('s1', { code: host.code, name: 'Kamala' }));

    expect(joined.code).toBe(host.code);
    expect(joined.token).not.toBe(host.token);
    expect(harness.room('s0').players.map((player) => player.name)).toEqual(['Nimal', 'Kamala']);
    expect(harness.room('s1')).toMatchObject({ youId: joined.playerId });
  });

  test('is refused for an unknown code', () => {
    const harness = createHarness();

    expect(errorOf(harness.service.joinRoom('s1', { code: 'ZZZZZZ', name: 'Kamala' }))).toBe(
      'room-not-found',
    );
  });

  test('is refused for a fifth player', () => {
    const harness = createHarness();
    const { code } = fillRoom(harness);

    expect(errorOf(harness.service.joinRoom('s4', { code, name: 'Late' }))).toBe('room-full');
  });

  test('is refused once the match has started', () => {
    const harness = createHarness();
    const { code } = startMatch(harness);

    expect(errorOf(harness.service.joinRoom('s4', { code, name: 'Late' }))).toBe(
      'match-in-progress',
    );
  });

  test('is refused for a socket that is already in a room', () => {
    const harness = createHarness();
    const { code } = mustOk(harness.service.createRoom('s0', { name: 'Nimal' }));

    expect(errorOf(harness.service.joinRoom('s0', { code, name: 'Nimal' }))).toBe(
      'already-in-room',
    );
  });
});

describe('starting the match', () => {
  test('is refused for anyone but the host', () => {
    const harness = createHarness();
    fillRoom(harness);

    expect(errorOf(harness.service.start('s1'))).toBe('not-host');
  });

  test('is refused until all 4 seats are filled', () => {
    const harness = createHarness();
    mustOk(harness.service.createRoom('s0', { name: 'Nimal' }));

    expect(errorOf(harness.service.start('s0'))).toBe('not-enough-players');
  });

  test('is refused for a socket that is not in a room', () => {
    expect(errorOf(createHarness().service.start('s9'))).toBe('not-in-room');
  });

  test('gives every player a different seat and sends each their own game state', () => {
    const harness = createHarness();

    startMatch(harness);

    const room = harness.room('s0');
    expect(room.status).toBe('playing');
    expect(room.players.map((player) => player.seat).sort()).toEqual([0, 1, 2, 3]);
    for (const socketId of SOCKETS) {
      const you = harness
        .room(socketId)
        .players.find((player) => player.id === harness.room(socketId).youId);
      expect(harness.game(socketId).view.seat).toBe(you?.seat);
      expect(harness.game(socketId).view.phase).toBe('calling-trump');
    }
  });

  test('draws seats at random, so teams are not fixed by joining order', () => {
    const hostSeats = new Set(
      Array.from({ length: 40 }, () => {
        const harness = createHarness();
        startMatch(harness);
        return harness.game('s0').view.seat;
      }),
    );

    expect(hostSeats.size).toBeGreaterThan(1);
  });

  test('cannot be done twice', () => {
    const harness = createHarness();
    startMatch(harness);

    expect(errorOf(harness.service.start('s0'))).toBe('match-in-progress');
  });
});

describe('leaving before the match starts', () => {
  test('removes the player and tells the others', () => {
    const harness = createHarness();
    fillRoom(harness);

    mustOk(harness.service.leave('s2'));

    expect(harness.room('s0').players.map((player) => player.name)).toEqual(['P0', 'P1', 'P3']);
  });

  test('hands the host role to the longest-waiting player when the host leaves', () => {
    const harness = createHarness();
    fillRoom(harness);

    mustOk(harness.service.leave('s0'));

    expect(harness.room('s1').players.find((player) => player.isHost)?.name).toBe('P1');
    expect(errorOf(harness.service.start('s1'))).toBe('not-enough-players');
  });

  test('frees the socket to join another room', () => {
    const harness = createHarness();
    fillRoom(harness);

    mustOk(harness.service.leave('s2'));

    expect(harness.service.createRoom('s2', { name: 'P2' }).ok).toBe(true);
  });

  test('removes the room when the last player leaves', () => {
    const harness = createHarness();
    const { code } = mustOk(harness.service.createRoom('s0', { name: 'Nimal' }));

    mustOk(harness.service.leave('s0'));

    expect(harness.store.find(code)).toBeUndefined();
  });

  test('is refused for a socket that is not in a room', () => {
    expect(errorOf(createHarness().service.leave('s9'))).toBe('not-in-room');
  });

  test('is not what a dropped connection does: that place is held', () => {
    const harness = createHarness();
    const { code } = fillRoom(harness);

    harness.service.disconnect('s3');

    expect(harness.store.find(code)?.players).toHaveLength(4);
    expect(harness.room('s0').players.map((player) => player.isConnected)).toEqual([
      true,
      true,
      true,
      false,
    ]);
  });

  test('ignores a disconnect from a socket that was never in a room', () => {
    expect(() => createHarness().service.disconnect('s9')).not.toThrow();
  });
});

describe('a server misconfigured with rules the engine rejects', () => {
  test('refuses to start the match with a generic error', () => {
    const harness = createHarness({ rules: { ...DEFAULT_RULES, tokenTarget: 0 } });
    fillRoom(harness);

    expect(errorOf(harness.service.start('s0'))).toBe('internal');
    expect(harness.room('s0').status).toBe('lobby');
  });
});
