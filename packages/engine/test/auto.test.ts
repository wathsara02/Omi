import { describe, expect, test } from 'vitest';
import { applyAutoAction, pickAutoCard, pickAutoTrump } from '../src/auto';
import type { Card, Suit } from '../src/cards';
import { seedRng } from '../src/rng';
import { card, cards, mustCreate, playLastTrick, playingState } from './helpers';

const nonEmpty = (text: string): [Card, ...Card[]] => {
  const [first, ...rest] = cards(text);
  if (!first) throw new Error('Need at least one card');
  return [first, ...rest];
};

const trumpsOverSeeds = (hand: readonly Card[], seeds = 80): Set<Suit> =>
  new Set(
    Array.from({ length: seeds }, (_unused, seed) => pickAutoTrump(hand, seedRng(seed)).value),
  );

describe('pickAutoCard', () => {
  test('picks the lowest rank', () => {
    expect(pickAutoCard(nonEmpty('KH 8H QH'), 'spades')).toEqual(card('8H'));
  });

  test('picks the lowest rank even when that card is a trump', () => {
    expect(pickAutoCard(nonEmpty('8H 7S'), 'spades')).toEqual(card('7S'));
  });

  test('prefers a non-trump among cards of equal rank', () => {
    expect(pickAutoCard(nonEmpty('7S 7H'), 'spades')).toEqual(card('7H'));
    expect(pickAutoCard(nonEmpty('7C 7H'), 'clubs')).toEqual(card('7H'));
  });

  test('breaks remaining ties by the suit order clubs, diamonds, hearts, spades', () => {
    expect(pickAutoCard(nonEmpty('7S 7H 7D 7C'), 'spades')).toEqual(card('7C'));
    expect(pickAutoCard(nonEmpty('9S 9H 9D'), 'clubs')).toEqual(card('9D'));
    expect(pickAutoCard(nonEmpty('9S 9H'), 'clubs')).toEqual(card('9H'));
  });

  test('does not depend on the order of the cards', () => {
    expect(pickAutoCard(nonEmpty('7C 7D 7H 7S'), 'spades')).toEqual(
      pickAutoCard(nonEmpty('7S 7H 7D 7C'), 'spades'),
    );
  });
});

describe('pickAutoTrump', () => {
  test('picks the suit held most', () => {
    const rng = seedRng(1);

    expect(pickAutoTrump(cards('AH KH 7H 9S'), rng)).toEqual({ value: 'hearts', state: rng });
  });

  test('breaks a two-way tie at random between the tied suits only', () => {
    expect(trumpsOverSeeds(cards('AH KH 7S 9S'))).toEqual(new Set(['hearts', 'spades']));
  });

  test('can pick any suit when all four are held equally', () => {
    expect(trumpsOverSeeds(cards('AH KS 7C 9D'))).toEqual(
      new Set(['clubs', 'diamonds', 'hearts', 'spades']),
    );
  });

  test('advances the rng when it breaks a tie', () => {
    const rng = seedRng(1);

    expect(pickAutoTrump(cards('AH KH 7S 9S'), rng).state).not.toBe(rng);
  });
});

describe('applyAutoAction', () => {
  test('calls the caller’s most-held suit as trump', () => {
    const dealt = mustCreate(1);
    const state = {
      ...dealt,
      hands: dealt.hands.map((hand, seat) =>
        seat === dealt.caller ? cards('AD KD 7D 9S') : hand,
      ) as unknown as typeof dealt.hands,
    };

    const result = applyAutoAction(state);

    expect(result.ok && result.value.state.trump).toBe('diamonds');
    expect(result.ok && result.value.state.phase).toBe('playing');
    expect(result.ok && result.value.events).toEqual([
      { type: 'trump-called', seat: dealt.caller, suit: 'diamonds' },
    ]);
  });

  test('keeps the advanced rng when the trump call needed a tie-break', () => {
    const dealt = mustCreate(1);
    const state = {
      ...dealt,
      hands: dealt.hands.map((hand, seat) =>
        seat === dealt.caller ? cards('AD KD 7S 9S') : hand,
      ) as unknown as typeof dealt.hands,
    };

    const result = applyAutoAction(state);

    expect(result.ok && result.value.state.rng).not.toBe(state.rng);
    expect(applyAutoAction(state)).toEqual(result);
  });

  test('plays the lowest card for the seat on turn', () => {
    const state = playingState({
      hands: [cards('KH 8C QD'), cards('7H'), cards('8H'), cards('9H')],
    });

    const result = applyAutoAction(state);

    expect(result.ok && result.value.events).toEqual([
      { type: 'card-played', seat: 0, card: card('8C') },
    ]);
  });

  test('follows suit even when a lower card of another suit is held', () => {
    const state = playingState({
      hands: [cards('QH'), cards('AH 7C'), cards('8H'), cards('9H')],
      turn: 1,
      currentTrick: { leader: 0, plays: [{ seat: 0, card: card('KH') }] },
    });

    const result = applyAutoAction(state);

    expect(result.ok && result.value.events).toEqual([
      { type: 'card-played', seat: 1, card: card('AH') },
    ]);
  });

  test('is rejected when nobody has to act', () => {
    const { state: scored } = playLastTrick();

    const result = applyAutoAction(scored);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('wrong-phase');
  });

  test('is rejected when the seat on turn has no card to play', () => {
    const state = playingState({ hands: [cards(''), cards('7H'), cards('8H'), cards('9H')] });

    const result = applyAutoAction(state);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid-action');
  });
});
