import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { cardKey, createDeck } from '../src/cards';
import { DEFAULT_RULES } from '../src/config';
import { createMatch, dealBatch } from '../src/deal';
import { SEATS, mapSeats, nextSeat, seatOrderFrom } from '../src/seats';
import type { GameState } from '../src/state';

const mustCreate = (seed: number, config = DEFAULT_RULES): GameState => {
  const result = createMatch(config, seed);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};

describe('seatOrderFrom', () => {
  test('lists all four seats in turn order starting at the given seat', () => {
    expect(seatOrderFrom(2, 'counter-clockwise')).toEqual([2, 3, 0, 1]);
    expect(seatOrderFrom(2, 'clockwise')).toEqual([2, 1, 0, 3]);
  });
});

describe('dealBatch', () => {
  const deck = createDeck();
  const emptyHands = mapSeats(() => []);

  test('deals 4 cards to each seat, starting with the first seat and continuing in turn order', () => {
    const { hands } = dealBatch(emptyHands, deck, 2, 'counter-clockwise');

    expect(hands[2]).toEqual(deck.slice(0, 4));
    expect(hands[3]).toEqual(deck.slice(4, 8));
    expect(hands[0]).toEqual(deck.slice(8, 12));
    expect(hands[1]).toEqual(deck.slice(12, 16));
  });

  test('leaves the undealt cards in the stock', () => {
    const { stock } = dealBatch(emptyHands, deck, 2, 'counter-clockwise');

    expect(stock).toEqual(deck.slice(16));
  });

  test('adds a second batch to the cards already held', () => {
    const first = dealBatch(emptyHands, deck, 0, 'counter-clockwise');

    const second = dealBatch(first.hands, first.stock, 0, 'counter-clockwise');

    expect(second.hands[0]).toEqual([...deck.slice(0, 4), ...deck.slice(16, 20)]);
    expect(second.stock).toEqual([]);
  });
});

describe('createMatch', () => {
  test('rejects an invalid config', () => {
    const result = createMatch({ ...DEFAULT_RULES, tokenTarget: 0 }, 1);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid-config');
  });

  test('starts in the trump-calling phase with empty scores', () => {
    const state = mustCreate(1);

    expect(state.phase).toBe('calling-trump');
    expect(state.trump).toBeNull();
    expect(state.tokens).toEqual({ A: 0, B: 0 });
    expect(state.tricksWon).toEqual({ A: 0, B: 0 });
    expect(state.carryOver).toBe(0);
    expect(state.roundNumber).toBe(1);
    expect(state.currentTrick).toBeNull();
    expect(state.previousTrick).toBeNull();
    expect(state.lastRound).toBeNull();
    expect(state.winner).toBeNull();
  });

  test('is deterministic for a seed', () => {
    expect(mustCreate(99)).toEqual(mustCreate(99));
  });

  test('chooses the first dealer at random', () => {
    const dealers = new Set(Array.from({ length: 60 }, (_unused, seed) => mustCreate(seed).dealer));

    expect(dealers).toEqual(new Set(SEATS));
  });

  test('makes the next player after the dealer the trump caller, and gives them the turn', () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const state = mustCreate(seed);

        expect(state.caller).toBe(nextSeat(state.dealer, 'counter-clockwise'));
        expect(state.turn).toBe(state.caller);
      }),
    );
  });

  test('follows the configured turn order when choosing the caller', () => {
    const state = mustCreate(5, { ...DEFAULT_RULES, turnOrder: 'clockwise' });

    expect(state.caller).toBe(nextSeat(state.dealer, 'clockwise'));
  });

  test('deals 4 cards each and keeps the other 16 in the stock, with no card repeated', () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const state = mustCreate(seed);
        const cards = [...state.hands.flat(), ...state.stock];

        expect(state.hands.map((hand) => hand.length)).toEqual([4, 4, 4, 4]);
        expect(state.stock).toHaveLength(16);
        expect(new Set(cards.map(cardKey)).size).toBe(32);
      }),
    );
  });

  test('shuffles the deck', () => {
    const state = mustCreate(3);

    expect([...state.hands.flat(), ...state.stock]).not.toEqual(createDeck());
  });
});
