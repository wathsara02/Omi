import { describe, expect, test } from 'vitest';
import { cardKey } from '../src/cards';
import { DEFAULT_RULES } from '../src/config';
import { card, errorCodeOf, mustApply, mustCreate, playLastTrick, playingState } from './helpers';

describe('next-round', () => {
  test('passes the deal to the previous trump caller', () => {
    const { state: scored } = playLastTrick();

    const { state } = mustApply(scored, { type: 'next-round' });

    expect(scored.caller).toBe(0);
    expect(state.dealer).toBe(0);
    expect(state.caller).toBe(1);
    expect(state.turn).toBe(1);
  });

  test('deals a fresh round and waits for trump', () => {
    const { state: scored } = playLastTrick();

    const { state } = mustApply(scored, { type: 'next-round' });

    expect(state.phase).toBe('calling-trump');
    expect(state.roundNumber).toBe(scored.roundNumber + 1);
    expect(state.trump).toBeNull();
    expect(state.hands.map((hand) => hand.length)).toEqual([4, 4, 4, 4]);
    expect(state.stock).toHaveLength(16);
    expect(new Set([...state.hands.flat(), ...state.stock].map(cardKey)).size).toBe(32);
  });

  test('clears the tricks of the finished round', () => {
    const { state: scored } = playLastTrick();

    const { state } = mustApply(scored, { type: 'next-round' });

    expect(state.tricksWon).toEqual({ A: 0, B: 0 });
    expect(state.currentTrick).toBeNull();
    expect(state.previousTrick).toBeNull();
    expect(state.lastRound).toBeNull();
  });

  test('keeps the tokens', () => {
    const { state: scored } = playLastTrick({ tokens: { A: 2, B: 5 } });

    const { state } = mustApply(scored, { type: 'next-round' });

    expect(state.tokens).toEqual({ A: 3, B: 5 });
  });

  test('passes the deal on as normal after a tie and keeps the carry-over', () => {
    const { state: tied } = playLastTrick({}, '7S');

    const { state } = mustApply(tied, { type: 'next-round' });

    expect(state.dealer).toBe(0);
    expect(state.carryOver).toBe(1);
  });

  test('shuffles again, so the new deal differs from the last', () => {
    const first = mustCreate(1);
    const { state: scored } = playLastTrick({ rng: first.rng });

    const { state } = mustApply(scored, { type: 'next-round' });

    expect(state.rng).not.toBe(scored.rng);
    expect(state.hands.flat().map(cardKey)).not.toEqual(first.hands.flat().map(cardKey));
  });

  test('emits a round-started event', () => {
    const { state: scored } = playLastTrick();

    const { events } = mustApply(scored, { type: 'next-round' });

    expect(events).toEqual([{ type: 'round-started', roundNumber: 2, dealer: 0, caller: 1 }]);
  });

  test('is rejected while a round is still being played', () => {
    expect(errorCodeOf(playingState(), { type: 'next-round' })).toBe('wrong-phase');
    expect(errorCodeOf(mustCreate(1), { type: 'next-round' })).toBe('wrong-phase');
  });
});

describe('end of match', () => {
  test('ends the match when a team reaches the token target', () => {
    const { state } = playLastTrick({ tokens: { A: 9, B: 4 } });

    expect(state.phase).toBe('match-over');
    expect(state.winner).toBe('A');
    expect(state.tokens).toEqual({ A: 10, B: 4 });
  });

  test('emits match-won after round-scored', () => {
    const { events } = playLastTrick({ tokens: { A: 9, B: 4 } });

    expect(events.at(-2)).toMatchObject({ type: 'round-scored' });
    expect(events.at(-1)).toEqual({ type: 'match-won', winner: 'A', tokens: { A: 10, B: 4 } });
  });

  test('still simply wins when an award plus a carry-over goes past the target', () => {
    const { state } = playLastTrick({ tokens: { A: 9, B: 9 }, carryOver: 1 });

    expect(state.phase).toBe('match-over');
    expect(state.winner).toBe('A');
    expect(state.tokens).toEqual({ A: 11, B: 9 });
  });

  test('continues while both teams are below the target', () => {
    const { state } = playLastTrick({ tokens: { A: 8, B: 9 } });

    expect(state.phase).toBe('round-scored');
    expect(state.winner).toBeNull();
  });

  test('does not end on a tie, even with a team one token short', () => {
    const { state } = playLastTrick({ tokens: { A: 9, B: 9 } }, '7S');

    expect(state.phase).toBe('round-scored');
    expect(state.winner).toBeNull();
  });

  test('uses the token target from the config', () => {
    const { state } = playLastTrick({ config: { ...DEFAULT_RULES, tokenTarget: 1 } });

    expect(state.phase).toBe('match-over');
  });

  test('accepts no further actions once the match is over', () => {
    const { state } = playLastTrick({ tokens: { A: 9, B: 4 } });

    expect(errorCodeOf(state, { type: 'next-round' })).toBe('wrong-phase');
    expect(errorCodeOf(state, { type: 'play-card', seat: 0, card: card('AH') })).toBe(
      'wrong-phase',
    );
    expect(errorCodeOf(state, { type: 'call-trump', seat: 0, suit: 'hearts' })).toBe('wrong-phase');
  });
});
