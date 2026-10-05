import { describe, expect, test } from 'vitest';
import {
  RANKS,
  SUITS,
  cardEquals,
  cardKey,
  createDeck,
  isCard,
  isSuit,
  rankValue,
} from '../src/cards';

describe('createDeck', () => {
  test('has 32 unique cards', () => {
    const deck = createDeck();

    expect(deck).toHaveLength(32);
    expect(new Set(deck.map(cardKey)).size).toBe(32);
  });

  test('has 7 through ace in each of the four suits', () => {
    const deck = createDeck();

    for (const suit of SUITS) {
      const ranks = deck.filter((card) => card.suit === suit).map((card) => card.rank);
      expect([...ranks].sort()).toEqual([...RANKS].sort());
    }
  });
});

describe('rankValue', () => {
  test('orders ranks A, K, Q, J, 10, 9, 8, 7 from high to low', () => {
    const highToLow = ['A', 'K', 'Q', 'J', '10', '9', '8', '7'] as const;

    const values = highToLow.map(rankValue);

    expect(values).toEqual([...values].sort((a, b) => b - a));
    expect(new Set(values).size).toBe(8);
  });
});

describe('cardEquals', () => {
  test('is true for the same suit and rank', () => {
    expect(cardEquals({ suit: 'hearts', rank: 'A' }, { suit: 'hearts', rank: 'A' })).toBe(true);
  });

  test('is false when suit or rank differs', () => {
    expect(cardEquals({ suit: 'hearts', rank: 'A' }, { suit: 'spades', rank: 'A' })).toBe(false);
    expect(cardEquals({ suit: 'hearts', rank: 'A' }, { suit: 'hearts', rank: 'K' })).toBe(false);
  });
});

describe('isSuit', () => {
  test('accepts the four suits and rejects anything else', () => {
    expect(SUITS.every(isSuit)).toBe(true);
    expect(isSuit('no-trump')).toBe(false);
    expect(isSuit(undefined)).toBe(false);
  });
});

describe('isCard', () => {
  test('accepts a well-formed card', () => {
    expect(isCard({ suit: 'clubs', rank: '10' })).toBe(true);
  });

  test.each([
    ['null', null],
    ['a string', 'clubs-10'],
    ['a rank outside the 32-card deck', { suit: 'clubs', rank: '2' }],
    ['an unknown suit', { suit: 'stars', rank: 'A' }],
    ['a missing rank', { suit: 'clubs' }],
  ])('rejects %s', (_label, value) => {
    expect(isCard(value)).toBe(false);
  });
});
