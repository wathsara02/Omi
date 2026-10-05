import { cardKey, type Card } from '@omi/engine';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  actOnTurn,
  collectCards,
  collectKeys,
  createHarness,
  errorOf,
  mustOk,
  playRound,
  SOCKETS,
  socketOnTurn,
  startMatch,
  TEST_TIMINGS,
  type Harness,
} from './harness';

const SECRET_KEYS = ['rng', 'stock', 'hands', 'tokenHash', 'socketId', 'token', 'match'];

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const started = (): Harness => {
  const harness = createHarness();
  startMatch(harness);
  return harness;
};

const notOnTurn = (harness: Harness): string => {
  const acting = socketOnTurn(harness);
  return SOCKETS.find((socketId) => socketId !== acting) as string;
};

describe('acting in a match', () => {
  test('applies the caller’s trump call and tells all four players', () => {
    const harness = started();
    const caller = socketOnTurn(harness);

    mustOk(harness.service.callTrump(caller, { seq: 0, suit: 'spades' }));

    for (const socketId of SOCKETS) {
      const { view, seq, events } = harness.game(socketId);
      expect(view).toMatchObject({ trump: 'spades', phase: 'playing' });
      expect(view.hand).toHaveLength(8);
      expect(seq).toBe(1);
      expect(events).toEqual([{ type: 'trump-called', seat: view.caller, suit: 'spades' }]);
    }
  });

  test('applies a played card', () => {
    const harness = started();
    mustOk(actOnTurn(harness));
    const leader = socketOnTurn(harness);
    const { view, seq } = harness.game(leader);
    const card = view.legalMoves[0] as Card;

    mustOk(harness.service.playCard(leader, { seq, card }));

    expect(harness.game(leader).view.currentTrick?.plays).toEqual([{ seat: view.seat, card }]);
    expect(harness.game(leader).view.hand).toHaveLength(7);
  });

  test('refuses a player who is not on turn, and tells nobody', () => {
    const harness = started();
    const sentBefore = harness.sent.length;

    const ack = harness.service.callTrump(notOnTurn(harness), { seq: 0, suit: 'spades' });

    expect(errorOf(ack)).toBe('not-trump-caller');
    expect(harness.sent).toHaveLength(sentBefore);
  });

  test('refuses a card the player does not hold, with a message for the client', () => {
    const harness = started();
    mustOk(actOnTurn(harness));
    const leader = socketOnTurn(harness);
    const { view, seq } = harness.game(leader);
    const held = new Set(view.hand.map(cardKey));
    const other = {
      suit: 'clubs',
      rank: (['7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const).find(
        (rank) => !held.has(cardKey({ suit: 'clubs', rank })),
      ),
    } as Card;

    const ack = harness.service.playCard(leader, { seq, card: other });

    expect(errorOf(ack)).toBe('card-not-in-hand');
    expect(!ack.ok && ack.error.message.length).toBeGreaterThan(0);
  });

  test('refuses an action carrying an old sequence number', () => {
    const harness = started();
    mustOk(actOnTurn(harness));
    const leader = socketOnTurn(harness);
    const { view } = harness.game(leader);

    const ack = harness.service.playCard(leader, { seq: 0, card: view.legalMoves[0] as Card });

    expect(errorOf(ack)).toBe('stale-action');
  });

  test('refuses actions from a socket that is not in a room', () => {
    expect(errorOf(started().service.callTrump('s9', { seq: 0, suit: 'spades' }))).toBe(
      'not-in-room',
    );
  });

  test('refuses actions before the match has started', () => {
    const harness = createHarness();
    mustOk(harness.service.createRoom('s0', { name: 'Nimal' }));

    expect(errorOf(harness.service.callTrump('s0', { seq: 0, suit: 'spades' }))).toBe('no-match');
  });
});

describe('what each player is sent', () => {
  test('a game state holds only that player’s own hand and the cards on the table', () => {
    const harness = started();
    mustOk(actOnTurn(harness));
    for (let play = 0; play < 6; play += 1) mustOk(actOnTurn(harness));

    for (const socketId of SOCKETS) {
      const snapshot = harness.game(socketId);
      const { view } = snapshot;
      const allowed = new Set(
        collectCards([view.hand, view.currentTrick, view.previousTrick]).map(cardKey),
      );

      expect(collectCards(snapshot).filter((card) => !allowed.has(cardKey(card)))).toEqual([]);
    }
  });

  test('once trump is called, the four players have been sent four separate sets of 8 cards', () => {
    const harness = started();
    mustOk(actOnTurn(harness));

    const everSent = SOCKETS.map(
      (socketId) =>
        new Set(
          harness.sent
            .filter((each) => each.socketId === socketId)
            .flatMap((each) => collectCards(each.payload).map(cardKey)),
        ),
    );

    expect(everSent.map((cards) => cards.size)).toEqual([8, 8, 8, 8]);
    expect(new Set(everSent.flatMap((cards) => [...cards])).size).toBe(32);
  });

  test('before trump is called, each player has been sent only their own first 4 cards', () => {
    const harness = started();

    const everSent = SOCKETS.map((socketId) =>
      harness.sent
        .filter((each) => each.socketId === socketId)
        .flatMap((each) => collectCards(each.payload).map(cardKey)),
    );

    expect(everSent.map((cards) => new Set(cards).size)).toEqual([4, 4, 4, 4]);
    expect(new Set(everSent.flat()).size).toBe(16);
  });

  test('nothing sent to anyone carries server-only fields', () => {
    const harness = started();
    playRound(harness);

    const keys = harness.sent.flatMap((each) => collectKeys(each.payload));

    expect(keys.filter((key) => SECRET_KEYS.includes(key))).toEqual([]);
  });

  test('every game state goes to the socket whose seat it describes', () => {
    const harness = started();
    playRound(harness);
    const seatBySocket = new Map(
      SOCKETS.map((socketId) => [socketId as string, harness.game(socketId).view.seat]),
    );

    const misdirected = harness.sent.filter(
      (each) =>
        each.event === 'game:state' &&
        (each.payload as ReturnType<Harness['game']>).view.seat !== seatBySocket.get(each.socketId),
    );

    expect(misdirected).toEqual([]);
  });
});

describe('between rounds and at the end', () => {
  test('waits out the pause, then deals the next round with a new seed', () => {
    const harness = started();
    playRound(harness);

    vi.advanceTimersByTime(TEST_TIMINGS.roundPauseMs - 1);
    expect(harness.game('s0').view.phase).toBe('round-scored');

    vi.advanceTimersByTime(1);
    expect(harness.game('s0').view).toMatchObject({ phase: 'calling-trump', roundNumber: 2 });
    expect(harness.game('s0').events).toMatchObject([{ type: 'round-started', roundNumber: 2 }]);
  });

  test('sets no turn deadline while a round is being scored', () => {
    const harness = started();
    playRound(harness);

    expect(harness.game('s0').deadline).toBeNull();
  });

  test('marks the room finished when a team reaches the target, and stops all timers', () => {
    const harness = started();

    for (let round = 0; round < 60 && harness.room('s0').status === 'playing'; round += 1) {
      playRound(harness);
      vi.advanceTimersByTime(TEST_TIMINGS.roundPauseMs);
    }

    expect(harness.room('s0').status).toBe('finished');
    expect(harness.game('s0').view.winner).not.toBeNull();
    // Only the idle timer of the finished room is left.
    expect(vi.getTimerCount()).toBe(1);
  });
});
