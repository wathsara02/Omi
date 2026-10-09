import { describe, expect, test } from 'vitest';
import {
  addPlayer,
  assignSeats,
  createRoom,
  findPlayerBySocket,
  hasConnectedHuman,
  removePlayer,
  startProblem,
  toRoomSnapshot,
  updatePlayer,
} from '../src/room/lobby';
import type { Player, Room } from '../src/room/types';

const player = (id: string, overrides: Partial<Player> = {}): Player => ({
  id,
  name: `Player ${id}`,
  tokenHash: Buffer.from(`hash-${id}`),
  socketId: `socket-${id}`,
  isBot: false,
  seat: null,
  holdDeadline: null,
  ...overrides,
});

const roomOf = (...ids: string[]): Room => {
  const [hostId = 'a', ...others] = ids;
  return others.reduce<Room>(
    (room, id) => {
      const added = addPlayer(room, player(id));
      if (!added.ok) throw new Error(added.code);
      return added.room;
    },
    createRoom('ABC234', player(hostId)),
  );
};

describe('createRoom', () => {
  test('starts a lobby with the creator as host', () => {
    const room = createRoom('ABC234', player('a'));

    expect(room).toMatchObject({ code: 'ABC234', status: 'lobby', hostId: 'a', match: null });
    expect(room.players.map((each) => each.id)).toEqual(['a']);
  });
});

describe('addPlayer', () => {
  test('adds players in the order they join', () => {
    expect(roomOf('a', 'b', 'c').players.map((each) => each.id)).toEqual(['a', 'b', 'c']);
  });

  test('does not change the room it was given', () => {
    const room = roomOf('a');

    addPlayer(room, player('b'));

    expect(room.players).toHaveLength(1);
  });

  test('refuses a fifth player', () => {
    expect(addPlayer(roomOf('a', 'b', 'c', 'd'), player('e'))).toEqual({
      ok: false,
      code: 'room-full',
    });
  });

  test('refuses anyone once the match has started', () => {
    const playing: Room = { ...roomOf('a', 'b', 'c'), status: 'playing' };

    expect(addPlayer(playing, player('d'))).toEqual({ ok: false, code: 'match-in-progress' });
  });
});

describe('removePlayer', () => {
  test('removes the player and keeps the others', () => {
    const room = removePlayer(roomOf('a', 'b', 'c'), 'b');

    expect(room?.players.map((each) => each.id)).toEqual(['a', 'c']);
  });

  test('makes the longest-waiting player host when the host leaves', () => {
    expect(removePlayer(roomOf('a', 'b', 'c'), 'a')?.hostId).toBe('b');
  });

  test('keeps the host when someone else leaves', () => {
    expect(removePlayer(roomOf('a', 'b', 'c'), 'c')?.hostId).toBe('a');
  });

  test('returns null when the last player leaves', () => {
    expect(removePlayer(roomOf('a'), 'a')).toBeNull();
  });
});

describe('startProblem', () => {
  test('is null when the host starts a full lobby', () => {
    expect(startProblem(roomOf('a', 'b', 'c', 'd'), 'a')).toBeNull();
  });

  test('stops anyone but the host', () => {
    expect(startProblem(roomOf('a', 'b', 'c', 'd'), 'b')).toBe('not-host');
  });

  test('stops the host until all 4 seats are filled', () => {
    expect(startProblem(roomOf('a', 'b', 'c'), 'a')).toBe('not-enough-players');
  });

  test('stops a second start', () => {
    const playing: Room = { ...roomOf('a', 'b', 'c', 'd'), status: 'playing' };

    expect(startProblem(playing, 'a')).toBe('match-in-progress');
  });
});

describe('assignSeats', () => {
  test('gives each player the seat at their position in the given order', () => {
    const room = assignSeats(roomOf('a', 'b', 'c', 'd'), [2, 0, 3, 1]);

    expect(room.players.map((each) => [each.id, each.seat])).toEqual([
      ['a', 2],
      ['b', 0],
      ['c', 3],
      ['d', 1],
    ]);
  });
});

describe('updatePlayer', () => {
  test('changes only the named player', () => {
    const room = updatePlayer(roomOf('a', 'b'), 'b', { socketId: null, isBot: true });

    expect(room.players[1]).toMatchObject({ id: 'b', socketId: null, isBot: true });
    expect(room.players[0]).toMatchObject({ id: 'a', socketId: 'socket-a', isBot: false });
  });
});

describe('findPlayerBySocket', () => {
  test('finds the player bound to a socket', () => {
    expect(findPlayerBySocket(roomOf('a', 'b'), 'socket-b')?.id).toBe('b');
  });

  test('finds nobody for an unknown socket', () => {
    expect(findPlayerBySocket(roomOf('a', 'b'), 'socket-z')).toBeUndefined();
  });
});

describe('hasConnectedHuman', () => {
  test('is true while any player has a socket', () => {
    const room = updatePlayer(roomOf('a', 'b'), 'a', { socketId: null });

    expect(hasConnectedHuman(room)).toBe(true);
  });

  test('is false when every player is disconnected or a bot', () => {
    const allGone = roomOf('a', 'b').players.reduce(
      (room, each) => updatePlayer(room, each.id, { socketId: null }),
      roomOf('a', 'b'),
    );

    expect(hasConnectedHuman(allGone)).toBe(false);
  });
});

describe('toRoomSnapshot', () => {
  const room = updatePlayer(assignSeats(roomOf('a', 'b', 'c', 'd'), [0, 1, 2, 3]), 'c', {
    socketId: null,
    isBot: true,
  });

  test('describes every player publicly', () => {
    const snapshot = toRoomSnapshot(room, 'b', 1234);

    expect(snapshot).toMatchObject({
      code: 'ABC234',
      status: 'lobby',
      youId: 'b',
      serverNow: 1234,
    });
    expect(snapshot.players[0]).toEqual({
      id: 'a',
      name: 'Player a',
      isHost: true,
      isConnected: true,
      isBot: false,
      seat: 0,
      holdDeadline: null,
    });
    expect(snapshot.players[2]).toMatchObject({ isHost: false, isConnected: false, isBot: true });
  });

  test('never includes a token hash, a socket id or the match state', () => {
    const json = JSON.stringify(toRoomSnapshot(room, 'b', 1234));

    expect(json).not.toMatch(/tokenHash|socketId|socket-|hash-|match|rng|stock/);
  });
});
