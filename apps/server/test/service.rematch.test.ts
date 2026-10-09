import { DEFAULT_RULES, type RulesConfig } from '@omi/engine';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  SOCKETS,
  TEST_TIMINGS,
  createHarness,
  errorOf,
  fillRoom,
  mustOk,
  playRound,
  startMatch,
  type Harness,
} from './harness';

const { idleRoomMs, roundPauseMs, botDelayMs } = TEST_TIMINGS;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const playToTheEnd = (harness: Harness): void => {
  for (let round = 0; round < 60 && harness.room('s0').status === 'playing'; round += 1) {
    playRound(harness);
    if (harness.room('s0').status === 'playing') vi.advanceTimersByTime(roundPauseMs);
  }
  expect(harness.room('s0').status).toBe('finished');
};

/** A match that one round can win, played to its end. */
const finishedMatch = (rules: RulesConfig = { ...DEFAULT_RULES, tokenTarget: 1 }) => {
  const harness = createHarness({ rules });
  const table = startMatch(harness);
  playToTheEnd(harness);
  return { harness, ...table };
};

const readyOf = (harness: Harness, socketId: string): boolean[] =>
  harness.room(socketId).players.map((player) => player.isReady);

const everyoneReady = (harness: Harness, sockets: readonly string[] = SOCKETS): void => {
  for (const socketId of sockets) mustOk(harness.service.ready(socketId));
};

describe('marking ready for another match', () => {
  test('is refused before the match has ended', () => {
    const lobby = createHarness();
    fillRoom(lobby);
    const playing = createHarness();
    startMatch(playing);

    expect(errorOf(lobby.service.ready('s0'))).toBe('match-not-over');
    expect(errorOf(playing.service.ready('s0'))).toBe('match-not-over');
  });

  test('is refused for a socket that is in no room', () => {
    const { harness } = finishedMatch();

    expect(errorOf(harness.service.ready('stranger'))).toBe('not-in-room');
  });

  test('starts with nobody ready', () => {
    const { harness } = finishedMatch();

    expect(readyOf(harness, 's0')).toEqual([false, false, false, false]);
  });

  test('shows everyone who is ready, and starts nothing while someone is not', () => {
    const { harness } = finishedMatch();

    mustOk(harness.service.ready('s1'));
    mustOk(harness.service.ready('s2'));

    for (const socketId of SOCKETS) {
      expect(readyOf(harness, socketId)).toEqual([false, true, true, false]);
      expect(harness.room(socketId).status).toBe('finished');
    }
  });

  test('can be sent twice without harm', () => {
    const { harness } = finishedMatch();

    mustOk(harness.service.ready('s1'));
    mustOk(harness.service.ready('s1'));

    expect(readyOf(harness, 's0')).toEqual([false, true, false, false]);
  });

  test('does not keep an idle finished room open', () => {
    const { harness, code } = finishedMatch();

    vi.advanceTimersByTime(idleRoomMs - 1);
    mustOk(harness.service.ready('s0'));
    vi.advanceTimersByTime(1);

    expect(harness.store.find(code)).toBeUndefined();
  });
});

describe('when every connected player is ready', () => {
  test('a new match starts at nil–nil with the same seats and teams', () => {
    const { harness } = finishedMatch();
    const seatsBefore = harness.room('s0').players.map((player) => player.seat);
    const seqBefore = harness.game('s0').seq;

    everyoneReady(harness);

    for (const socketId of SOCKETS) {
      const { view, seq, deadline } = harness.game(socketId);
      expect(harness.room(socketId).status).toBe('playing');
      expect(view.phase).toBe('calling-trump');
      expect(view.roundNumber).toBe(1);
      expect(view.tokens).toEqual({ A: 0, B: 0 });
      expect(view.winner).toBeNull();
      expect(view.lastRound).toBeNull();
      expect(view.hand).toHaveLength(4);
      expect(seq).toBeGreaterThan(seqBefore);
      expect(deadline).not.toBeNull();
    }
    expect(harness.room('s0').players.map((player) => player.seat)).toEqual(seatsBefore);
    expect(readyOf(harness, 's0')).toEqual([false, false, false, false]);
  });

  test('the new match can be played, and an action from the old one is refused', () => {
    const { harness } = finishedMatch();
    const old = harness.game('s0');
    everyoneReady(harness);

    expect(errorOf(harness.service.callTrump('s0', { seq: old.seq, suit: 'hearts' }))).toBe(
      'stale-action',
    );
    playRound(harness);

    expect(harness.game('s0').view.lastRound).not.toBeNull();
  });

  test('the room is no longer counted as idle', () => {
    const { harness, code } = finishedMatch();
    everyoneReady(harness);

    // Ten minutes after the first match ended, when its idle timer would have run out.
    vi.advanceTimersByTime(idleRoomMs);

    expect(harness.store.find(code)).toBeDefined();
  });

  test('a second rematch works the same way, with fresh ready marks', () => {
    const { harness, code } = finishedMatch();
    everyoneReady(harness);
    playToTheEnd(harness);
    expect(readyOf(harness, 's0')).toEqual([false, false, false, false]);

    everyoneReady(harness, ['s0', 's1', 's2']);
    expect(harness.room('s0').status).toBe('finished');
    mustOk(harness.service.ready('s3'));

    expect(harness.room('s0').status).toBe('playing');
    expect(harness.game('s0').view.tokens).toEqual({ A: 0, B: 0 });
    expect(harness.store.find(code)).toBeDefined();
  });

  test('if the new match cannot be dealt, the player is told and can try again', () => {
    const rules = { ...DEFAULT_RULES, tokenTarget: 1 };
    const { harness } = finishedMatch(rules);
    everyoneReady(harness, ['s0', 's1', 's2']);

    rules.tokenTarget = 0;
    expect(errorOf(harness.service.ready('s3'))).toBe('internal');
    expect(harness.room('s0').status).toBe('finished');
    expect(readyOf(harness, 's0')).toEqual([false, false, false, false]);

    rules.tokenTarget = 1;
    everyoneReady(harness);
    expect(harness.room('s0').status).toBe('playing');
  });

  test('a seat whose player has left is played by a bot', () => {
    const { harness } = finishedMatch();
    mustOk(harness.service.leave('s3'));

    everyoneReady(harness, ['s0', 's1', 's2']);

    const room = harness.room('s0');
    expect(room.status).toBe('playing');
    expect(room.players[3]).toMatchObject({ isConnected: false, isBot: true, holdDeadline: null });
    // The bot acts when its turn comes, so the round finishes without the fourth player.
    for (let step = 0; step < 200 && harness.game('s0').view.lastRound === null; step += 1) {
      const { view, seq } = harness.game('s0');
      const onTurn = ['s0', 's1', 's2'].find((socketId) => {
        const mine = harness.game(socketId).view;
        return mine.turn === mine.seat;
      });
      if (onTurn === undefined) {
        vi.advanceTimersByTime(botDelayMs);
        expect(harness.game('s0').seq).toBeGreaterThan(seq);
        continue;
      }
      const mine = harness.game(onTurn);
      mustOk(
        view.phase === 'calling-trump'
          ? harness.service.callTrump(onTurn, { seq: mine.seq, suit: 'hearts' })
          : harness.service.playCard(onTurn, {
              seq: mine.seq,
              card: mine.view.legalMoves[0] as (typeof mine.view.legalMoves)[number],
            }),
      );
    }
    expect(harness.game('s0').view.lastRound).not.toBeNull();
  });

  test('the match starts when the last player who was not ready leaves', () => {
    const { harness } = finishedMatch();
    everyoneReady(harness, ['s0', 's1', 's2']);
    expect(harness.room('s0').status).toBe('finished');

    harness.service.disconnect('s3');

    expect(harness.room('s0').status).toBe('playing');
    expect(harness.room('s0').players[3]).toMatchObject({ isConnected: false, isBot: true });
  });

  test('a player who left while ready does not stay marked ready', () => {
    const { harness, code, sessions } = finishedMatch();
    mustOk(harness.service.ready('s3'));
    harness.service.disconnect('s3');

    mustOk(
      harness.service.resume('s3-again', { code, token: (sessions[3] as { token: string }).token }),
    );

    expect(readyOf(harness, 's0')).toEqual([false, false, false, false]);
    expect(harness.room('s0').status).toBe('finished');
  });

  test('a player who left can take the seat back from the bot in the new match', () => {
    const { harness, code, sessions } = finishedMatch();
    mustOk(harness.service.leave('s3'));
    everyoneReady(harness, ['s0', 's1', 's2']);

    mustOk(
      harness.service.resume('s3-again', { code, token: (sessions[3] as { token: string }).token }),
    );

    expect(harness.room('s0').players[3]).toMatchObject({ isConnected: true, isBot: false });
    expect(harness.game('s3-again').view.hand).toHaveLength(4);
  });
});
