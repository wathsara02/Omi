import { describe, expect, test } from 'vitest';
import { DEFAULT_RULES } from '../src/config';
import { scoreRound } from '../src/scoring';
import type { Team } from '../src/seats';
import { card, errorCodeOf, playLastTrick } from './helpers';

const score = (a: number, b: number, carryOver = 0, callingTeam: Team = 'A') =>
  scoreRound({ tricks: { A: a, B: b }, callingTeam, carryOver, config: DEFAULT_RULES });

describe('scoreRound', () => {
  test.each([5, 6, 7])('gives 1 token to the calling team for %i tricks', (tricks) => {
    const { result } = score(tricks, 8 - tricks);

    expect(result).toMatchObject({ winner: 'A', tokensAwarded: 1, isKapothi: false });
  });

  test.each([5, 6, 7])('gives 2 tokens to the defending team for %i tricks', (tricks) => {
    const { result } = score(8 - tricks, tricks);

    expect(result).toMatchObject({ winner: 'B', tokensAwarded: 2, isKapothi: false });
  });

  test('gives 3 tokens for a kapothi by the calling team', () => {
    expect(score(8, 0).result).toMatchObject({ winner: 'A', tokensAwarded: 3, isKapothi: true });
  });

  test('gives 3 tokens for a kapothi by the defending team', () => {
    expect(score(0, 8).result).toMatchObject({ winner: 'B', tokensAwarded: 3, isKapothi: true });
  });

  test('treats the caller’s team as the calling team whichever team that is', () => {
    expect(score(3, 5, 0, 'B').result).toMatchObject({ winner: 'B', tokensAwarded: 1 });
    expect(score(5, 3, 0, 'B').result).toMatchObject({ winner: 'A', tokensAwarded: 2 });
  });

  test('gives nothing on a 4–4 tie and sets a carry-over of 1', () => {
    const { result, carryOver } = score(4, 4);

    expect(result).toMatchObject({ winner: null, tokensAwarded: 0, isKapothi: false });
    expect(carryOver).toBe(1);
  });

  test('keeps the carry-over at 1 after consecutive ties', () => {
    expect(score(4, 4, 1).carryOver).toBe(1);
  });

  test('adds the carry-over to the next decided round and then clears it', () => {
    const { result, carryOver } = score(5, 3, 1);

    expect(result).toMatchObject({ baseTokens: 1, carryOverTokens: 1, tokensAwarded: 2 });
    expect(carryOver).toBe(0);
  });

  test('adds the carry-over to a defending-team win', () => {
    expect(score(2, 6, 1).result.tokensAwarded).toBe(3);
  });

  test('makes a kapothi after a tie worth 3 + 1 = 4 tokens', () => {
    expect(score(8, 0, 1).result.tokensAwarded).toBe(4);
  });

  test('reads the awards from the config', () => {
    const config = { ...DEFAULT_RULES, tokensKapothi: 4, tieCarryOver: 2 };

    expect(
      scoreRound({ tricks: { A: 0, B: 8 }, callingTeam: 'A', carryOver: 0, config }).result
        .tokensAwarded,
    ).toBe(4);
    expect(
      scoreRound({ tricks: { A: 4, B: 4 }, callingTeam: 'A', carryOver: 0, config }).carryOver,
    ).toBe(2);
  });

  test('records the trick counts and the calling team', () => {
    expect(score(6, 2).result).toMatchObject({ tricks: { A: 6, B: 2 }, callingTeam: 'A' });
  });
});

describe('finishing a round', () => {
  test('scores the round once the eighth trick is played', () => {
    const { state } = playLastTrick({ tricksWon: { A: 4, B: 3 } });

    expect(state.phase).toBe('round-scored');
    expect(state.tokens).toEqual({ A: 1, B: 0 });
    expect(state.lastRound).toMatchObject({ winner: 'A', tricks: { A: 5, B: 3 } });
    expect(state.turn).toBeNull();
    expect(state.currentTrick).toBeNull();
  });

  test('keeps the eighth trick visible as the previous trick', () => {
    const { state } = playLastTrick({ tricksWon: { A: 4, B: 3 } });

    expect(state.previousTrick?.winner).toBe(0);
    expect(state.previousTrick?.plays).toHaveLength(4);
  });

  test('emits round-scored after the last trick-won', () => {
    const { state, events } = playLastTrick({ tricksWon: { A: 4, B: 3 } });

    expect(events.slice(-2)).toEqual([
      { type: 'trick-won', winner: 0, team: 'A' },
      { type: 'round-scored', result: state.lastRound, tokens: { A: 1, B: 0 } },
    ]);
  });

  test('plays on to all 8 tricks even after a team has won 5', () => {
    const { state } = playLastTrick({ tricksWon: { A: 5, B: 1 } });

    expect(state.phase).toBe('playing');
    expect(state.tricksWon).toEqual({ A: 6, B: 1 });
    expect(state.tokens).toEqual({ A: 0, B: 0 });
  });

  test('awards nothing on a 4–4 tie and carries 1 token over', () => {
    const { state } = playLastTrick({ tricksWon: { A: 4, B: 3 } }, '7S');

    expect(state.tokens).toEqual({ A: 0, B: 0 });
    expect(state.carryOver).toBe(1);
    expect(state.lastRound?.winner).toBeNull();
  });

  test('adds an existing carry-over to the winner’s tokens and clears it', () => {
    const { state } = playLastTrick({ tricksWon: { A: 4, B: 3 }, carryOver: 1 });

    expect(state.tokens).toEqual({ A: 2, B: 0 });
    expect(state.carryOver).toBe(0);
  });

  test('adds to the tokens already held', () => {
    const { state } = playLastTrick({ tricksWon: { A: 2, B: 5 }, tokens: { A: 3, B: 4 } });

    expect(state.tokens).toEqual({ A: 3, B: 6 });
  });

  test('rejects further plays once the round is scored', () => {
    const { state } = playLastTrick({ tricksWon: { A: 4, B: 3 } });

    expect(errorCodeOf(state, { type: 'play-card', seat: 0, card: card('AH') })).toBe(
      'wrong-phase',
    );
  });
});
