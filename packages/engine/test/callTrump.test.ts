import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import type { Action } from '../src/actions';
import { cardKey, type Suit } from '../src/cards';
import { nextSeat, seatOrderFrom } from '../src/seats';
import { errorCodeOf, mustApply, mustCreate } from './helpers';

describe('call-trump', () => {
  test('sets trump, moves to the playing phase and has the caller lead the first trick', () => {
    const state = mustCreate(1);

    const { state: next } = mustApply(state, {
      type: 'call-trump',
      seat: state.caller,
      suit: 'hearts',
    });

    expect(next.trump).toBe('hearts');
    expect(next.phase).toBe('playing');
    expect(next.turn).toBe(state.caller);
    expect(next.currentTrick).toEqual({ leader: state.caller, plays: [] });
  });

  test('deals the remaining 4 cards to each player so everyone has 8', () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const state = mustCreate(seed);

        const { state: next } = mustApply(state, {
          type: 'call-trump',
          seat: state.caller,
          suit: 'spades',
        });

        expect(next.hands.map((hand) => hand.length)).toEqual([8, 8, 8, 8]);
        expect(next.stock).toEqual([]);
        expect(new Set(next.hands.flat().map(cardKey)).size).toBe(32);
      }),
    );
  });

  test('deals the second batch from the stock in turn order starting with the caller', () => {
    const state = mustCreate(4);
    const order = seatOrderFrom(state.caller, state.config.turnOrder);

    const { state: next } = mustApply(state, {
      type: 'call-trump',
      seat: state.caller,
      suit: 'clubs',
    });

    order.forEach((seat, position) => {
      expect(next.hands[seat]).toEqual([
        ...state.hands[seat],
        ...state.stock.slice(position * 4, position * 4 + 4),
      ]);
    });
  });

  test('emits a trump-called event', () => {
    const state = mustCreate(1);

    const { events } = mustApply(state, { type: 'call-trump', seat: state.caller, suit: 'clubs' });

    expect(events).toEqual([{ type: 'trump-called', seat: state.caller, suit: 'clubs' }]);
  });

  test('does not mutate the state it was given', () => {
    const state = mustCreate(1);
    const snapshot = structuredClone(state);

    mustApply(state, { type: 'call-trump', seat: state.caller, suit: 'clubs' });

    expect(state).toEqual(snapshot);
  });

  test('rejects a call from anyone but the trump caller', () => {
    const state = mustCreate(1);
    const notCaller = nextSeat(state.caller, state.config.turnOrder);

    expect(errorCodeOf(state, { type: 'call-trump', seat: notCaller, suit: 'clubs' })).toBe(
      'not-trump-caller',
    );
  });

  test('rejects anything that is not one of the four suits, so there is no pass or no-trump', () => {
    const state = mustCreate(1);
    const action = { type: 'call-trump', seat: state.caller, suit: 'no-trump' as Suit } as const;

    expect(errorCodeOf(state, action)).toBe('invalid-action');
  });

  test('rejects a second call once trump is named', () => {
    const state = mustCreate(1);
    const call: Action = { type: 'call-trump', seat: state.caller, suit: 'clubs' };

    const { state: playing } = mustApply(state, call);

    expect(errorCodeOf(playing, call)).toBe('wrong-phase');
  });
});

describe('applyAction', () => {
  test('rejects an action of an unknown type', () => {
    const state = mustCreate(1);

    expect(errorCodeOf(state, { type: 'shuffle-again' } as unknown as Action)).toBe(
      'invalid-action',
    );
  });
});
