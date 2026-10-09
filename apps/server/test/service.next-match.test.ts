import { DEFAULT_RULES } from '@omi/engine';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  SOCKETS,
  TEST_TIMINGS,
  actOnTurn,
  createHarness,
  errorOf,
  mustOk,
  playRound,
  startMatch,
  type Harness,
} from './harness';

const { roundPauseMs, turnMs } = TEST_TIMINGS;
const ONE_ROUND_MATCH = { ...DEFAULT_RULES, tokenTarget: 1 };

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Plays to the end of the match; seats with no listed socket are left to the timer. */
const playToTheEnd = (harness: Harness, sockets: readonly string[] = SOCKETS): void => {
  const [watcher = 's0'] = sockets;
  for (let step = 0; step < 4000 && harness.room(watcher).status === 'playing'; step += 1) {
    const { view } = harness.game(watcher);
    const isHumanTurn = sockets.some((socketId) => {
      const mine = harness.game(socketId).view;
      return mine.turn === mine.seat;
    });
    if (view.turn === null) vi.advanceTimersByTime(roundPauseMs);
    else if (isHumanTurn) mustOk(actOnTurn(harness, sockets));
    else vi.advanceTimersByTime(turnMs);
  }
  expect(harness.room(watcher).status).toBe('lobby');
};

/** A match that one round can win, played to its end by all four players. */
const afterMatch = () => {
  const harness = createHarness({ rules: ONE_ROUND_MATCH });
  const table = startMatch(harness);
  for (let round = 0; round < 60 && harness.room('s0').status === 'playing'; round += 1) {
    playRound(harness);
    if (harness.room('s0').status === 'playing') vi.advanceTimersByTime(roundPauseMs);
  }
  return { harness, ...table };
};

describe('when a match ends', () => {
  test('the room is a lobby again, with the same players and host and no seats', () => {
    const { harness, code, sessions } = afterMatch();

    for (const socketId of SOCKETS) {
      const room = harness.room(socketId);
      expect(room).toMatchObject({ code, status: 'lobby' });
      expect(room.players.map((player) => player.id)).toEqual(
        sessions.map((session) => session.playerId),
      );
      expect(room.players.every((player) => player.seat === null && !player.isBot)).toBe(true);
      expect(room.players.map((player) => player.isHost)).toEqual([true, false, false, false]);
    }
  });

  test('everyone gets the final state of the match before the lobby', () => {
    const { harness } = afterMatch();

    for (const socketId of SOCKETS) {
      const events = harness.sent
        .filter((each) => each.socketId === socketId)
        .map((each) => each.event);
      const lastGame = events.lastIndexOf('game:state');
      const lastRoom = events.lastIndexOf('room:state');
      expect(harness.game(socketId).view.phase).toBe('match-over');
      expect(harness.game(socketId).view.winner).not.toBeNull();
      expect(lastGame).toBeLessThan(lastRoom);
    }
  });

  test('nothing more can be played', () => {
    const { harness } = afterMatch();
    const { seq } = harness.game('s0');

    expect(errorOf(harness.service.callTrump('s0', { seq, suit: 'hearts' }))).toBe('no-match');
  });

  test('players who are not connected are removed, bots included', () => {
    const harness = createHarness({ rules: ONE_ROUND_MATCH });
    const { sessions } = startMatch(harness);
    harness.service.disconnect('s2');
    vi.advanceTimersByTime(TEST_TIMINGS.holdMs);
    harness.service.disconnect('s3');

    playToTheEnd(harness, ['s0', 's1']);

    expect(harness.room('s0').players.map((player) => player.id)).toEqual([
      sessions[0]?.playerId,
      sessions[1]?.playerId,
    ]);
  });

  test('if the host is not connected, the longest-waiting player becomes host', () => {
    const harness = createHarness({ rules: ONE_ROUND_MATCH });
    startMatch(harness);
    harness.service.disconnect('s0');

    playToTheEnd(harness, ['s1', 's2', 's3']);

    expect(harness.room('s1').players.map((player) => player.isHost)).toEqual([true, false, false]);
  });

  test('leaves no timer behind for a removed player, only the lobby’s idle timer', () => {
    const harness = createHarness({ rules: ONE_ROUND_MATCH });
    startMatch(harness);
    harness.service.disconnect('s3');
    playToTheEnd(harness, ['s0', 's1', 's2']);
    const sentBefore = harness.sent.length;

    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(TEST_TIMINGS.holdMs);

    expect(harness.sent).toHaveLength(sentBefore);
    expect(harness.room('s0').players).toHaveLength(3);
  });

  test('a connected player who reloads keeps their place and is sent only the lobby', () => {
    const { harness, code, sessions } = afterMatch();
    const token = sessions[1]?.token as string;

    mustOk(harness.service.resume('s1-again', { code, token }));

    expect(harness.room('s1-again')).toMatchObject({ status: 'lobby' });
    expect(harness.room('s1-again').players).toHaveLength(4);
    expect(
      harness.sent.some((each) => each.socketId === 's1-again' && each.event === 'game:state'),
    ).toBe(false);
  });

  test('a removed player cannot resume the old seat', () => {
    const harness = createHarness({ rules: ONE_ROUND_MATCH });
    const { code, sessions } = startMatch(harness);
    harness.service.disconnect('s3');
    playToTheEnd(harness, ['s0', 's1', 's2']);

    const ack = harness.service.resume('s3-again', { code, token: sessions[3]?.token as string });

    expect(errorOf(ack)).toBe('session-invalid');
  });
});

describe('the next match', () => {
  test('is started by the host, from nil-nil', () => {
    const { harness } = afterMatch();
    const old = harness.game('s0');

    expect(errorOf(harness.service.start('s1'))).toBe('not-host');
    mustOk(harness.service.start('s0'));

    for (const socketId of SOCKETS) {
      const { view, seq } = harness.game(socketId);
      expect(harness.room(socketId).status).toBe('playing');
      expect(view).toMatchObject({ phase: 'calling-trump', roundNumber: 1, winner: null });
      expect(view.tokens).toEqual({ A: 0, B: 0 });
      expect(view.lastRound).toBeNull();
      expect(view.hand).toHaveLength(4);
      expect(seq).toBeGreaterThan(old.seq);
    }
    expect(
      harness
        .room('s0')
        .players.map((player) => player.seat)
        .sort(),
    ).toEqual([0, 1, 2, 3]);
  });

  test('refuses an action left over from the old match', () => {
    const { harness } = afterMatch();
    const old = harness.game('s0');
    mustOk(harness.service.start('s0'));

    for (const socketId of SOCKETS) {
      expect(errorOf(harness.service.callTrump(socketId, { seq: old.seq, suit: 'hearts' }))).toBe(
        'stale-action',
      );
    }
  });

  test('needs four players, and a new player can take the place of one who left', () => {
    const { harness, code } = afterMatch();
    mustOk(harness.service.leave('s3'));
    expect(errorOf(harness.service.start('s0'))).toBe('not-enough-players');

    mustOk(harness.service.joinRoom('s4', { code, name: 'New' }));
    // Nothing of the match that was played reaches the newcomer.
    expect(harness.sent.some((each) => each.socketId === 's4' && each.event === 'game:state')).toBe(
      false,
    );
    mustOk(harness.service.start('s0'));

    expect(harness.room('s4').status).toBe('playing');
    expect(harness.game('s4').view.hand).toHaveLength(4);
  });

  test('lets the host remove a player first', () => {
    const { harness } = afterMatch();
    const target = harness.room('s2').youId;

    mustOk(harness.service.kick('s0', { playerId: target }));

    expect(harness.room('s0').players).toHaveLength(3);
  });

  test('ends in the lobby again, ready for another', () => {
    const { harness } = afterMatch();
    mustOk(harness.service.start('s0'));

    playToTheEnd(harness);
    mustOk(harness.service.start('s0'));

    expect(harness.room('s0').status).toBe('playing');
  });

  test('is never removed for being idle, however long it runs', () => {
    const { harness, code } = afterMatch();
    mustOk(harness.service.start('s0'));

    // One turn timer short of the idle time: the match is still in its first round.
    vi.advanceTimersByTime(turnMs * 20);
    expect(harness.room('s0').status).toBe('playing');
    vi.advanceTimersByTime(TEST_TIMINGS.idleRoomMs - turnMs * 20);

    expect(harness.store.find(code)).toBeDefined();
  });
});
