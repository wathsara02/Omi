import { describe, expect, test } from 'vitest';
import type { Seat } from '../src/seats';
import type { GameState, PlayedCard } from '../src/state';
import { trickWinner } from '../src/trick';
import { card, cards, mustApply, playingState } from './helpers';

const plays = (text: string): [PlayedCard, ...PlayedCard[]] => {
  const [first, ...rest] = cards(text).map((played, seat) => ({
    seat: seat as Seat,
    card: played,
  }));
  if (!first) throw new Error('A trick needs at least one play');
  return [first, ...rest];
};

const playAll = (state: GameState, sequence: readonly (readonly [Seat, string])[]) =>
  sequence.reduce(
    (current, [seat, text]) => {
      const applied = mustApply(current.state, { type: 'play-card', seat, card: card(text) });
      return { state: applied.state, events: [...current.events, ...applied.events] };
    },
    { state, events: [] as readonly unknown[] },
  );

describe('trickWinner', () => {
  test.each<[string, string, Seat]>([
    ['the highest card of the led suit wins when no trump is played', '9H AH KH 7H', 1],
    ['a higher card of another non-trump suit never wins', '9H AD AC 7H', 0],
    ['any trump beats the led suit', 'AH KH 7S QH', 2],
    ['the highest trump wins when several are played', 'AH 7S JS 9S', 2],
    ['the highest trump wins when trump is led', '9S KS AH 10S', 1],
    ['the ten ranks below the jack', '10H JH 9H 8H', 1],
  ])('%s', (_label, text, expected) => {
    expect(trickWinner(plays(text), 'spades')).toBe(expected);
  });
});

describe('completing a trick', () => {
  const hands = [cards('AH 7C'), cards('7H KC'), cards('8H 8D'), cards('9H 9D')] as const;
  const fourPlays = [
    [0, 'AH'],
    [1, '7H'],
    [2, '8H'],
    [3, '9H'],
  ] as const;

  test('gives the trick to the winner’s team and has the winner lead the next one', () => {
    const { state } = playAll(playingState({ hands }), fourPlays);

    expect(state.tricksWon).toEqual({ A: 1, B: 0 });
    expect(state.turn).toBe(0);
    expect(state.currentTrick).toEqual({ leader: 0, plays: [] });
  });

  test('keeps the completed trick as the previous trick', () => {
    const { state } = playAll(playingState({ hands }), fourPlays);

    expect(state.previousTrick).toEqual({
      leader: 0,
      winner: 0,
      plays: fourPlays.map(([seat, text]) => ({ seat, card: card(text) })),
    });
  });

  test('lets a player with none of the led suit win with a trump and lead next', () => {
    const trumpHands = [cards('AH 7C'), cards('7H KC'), cards('8H 8D'), cards('7S 9D')] as const;

    const { state } = playAll(playingState({ hands: trumpHands }), [
      [0, 'AH'],
      [1, '7H'],
      [2, '8H'],
      [3, '7S'],
    ]);

    expect(state.tricksWon).toEqual({ A: 0, B: 1 });
    expect(state.turn).toBe(3);
  });

  test('emits trick-won after the fourth card-played', () => {
    const { events } = playAll(playingState({ hands }), fourPlays);

    expect(events.slice(-2)).toEqual([
      { type: 'card-played', seat: 3, card: card('9H') },
      { type: 'trick-won', winner: 0, team: 'A' },
    ]);
  });

  test('counts tricks per team, not per player', () => {
    const { state } = playAll(playingState({ hands }), [
      ...fourPlays,
      [0, '7C'],
      [1, 'KC'],
      [2, '8D'],
      [3, '9D'],
    ]);

    expect(state.tricksWon).toEqual({ A: 1, B: 1 });
  });

  test('replaces the previous trick each time, so only the last one is kept', () => {
    const partnerHands = [cards('KH 7C'), cards('7H 8C'), cards('AH AC'), cards('9H 9C')] as const;

    const { state } = playAll(playingState({ hands: partnerHands }), [
      [0, 'KH'],
      [1, '7H'],
      [2, 'AH'],
      [3, '9H'],
      [2, 'AC'],
      [3, '9C'],
      [0, '7C'],
      [1, '8C'],
    ]);

    expect(state.tricksWon).toEqual({ A: 2, B: 0 });
    expect(state.previousTrick?.leader).toBe(2);
    expect(state.previousTrick?.plays[0]).toEqual({ seat: 2, card: card('AC') });
  });
});
