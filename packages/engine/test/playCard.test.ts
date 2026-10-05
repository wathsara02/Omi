import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { cardEquals, type Card } from '../src/cards';
import { DEFAULT_RULES } from '../src/config';
import { legalCards, legalMoves } from '../src/legalMoves';
import { card, cards, errorCodeOf, mustApply, mustCreate, playingState } from './helpers';

describe('legalCards', () => {
  const hand = cards('AH 7H KC 9S');

  test('allows any card when leading', () => {
    expect(legalCards(hand, null)).toEqual(hand);
  });

  test('allows only cards of the led suit when the hand has one', () => {
    expect(legalCards(hand, 'hearts')).toEqual(cards('AH 7H'));
  });

  test('allows any card, including a trump, when the hand has none of the led suit', () => {
    expect(legalCards(hand, 'diamonds')).toEqual(hand);
  });
});

describe('legalMoves', () => {
  test('is the legal cards of the seat whose turn it is', () => {
    const state = playingState({
      hands: [cards('AH'), cards('7H KC'), cards('8D'), cards('9D')],
      turn: 1,
      currentTrick: { leader: 0, plays: [{ seat: 0, card: card('QH') }] },
    });

    expect(legalMoves(state, 1)).toEqual(cards('7H'));
  });

  test('is empty for a seat that is not on turn', () => {
    expect(legalMoves(playingState(), 2)).toEqual([]);
  });

  test('is empty before trump is called', () => {
    const state = mustCreate(1);

    expect(legalMoves(state, state.caller)).toEqual([]);
  });
});

describe('play-card', () => {
  const hands = [cards('AH 7C'), cards('7H KC'), cards('8D 8H'), cards('9D 9H')] as const;

  test('moves the card from the hand to the trick and passes the turn on', () => {
    const state = playingState({ hands });

    const { state: next } = mustApply(state, { type: 'play-card', seat: 0, card: card('AH') });

    expect(next.hands[0]).toEqual(cards('7C'));
    expect(next.currentTrick).toEqual({ leader: 0, plays: [{ seat: 0, card: card('AH') }] });
    expect(next.turn).toBe(1);
  });

  test('passes the turn the other way when play is clockwise', () => {
    const state = playingState({ hands, config: { ...DEFAULT_RULES, turnOrder: 'clockwise' } });

    const { state: next } = mustApply(state, { type: 'play-card', seat: 0, card: card('AH') });

    expect(next.turn).toBe(3);
  });

  test('emits a card-played event', () => {
    const { events } = mustApply(playingState({ hands }), {
      type: 'play-card',
      seat: 0,
      card: card('AH'),
    });

    expect(events).toEqual([{ type: 'card-played', seat: 0, card: card('AH') }]);
  });

  test('does not mutate the state it was given', () => {
    const state = playingState({ hands });
    const snapshot = structuredClone(state);

    mustApply(state, { type: 'play-card', seat: 0, card: card('AH') });

    expect(state).toEqual(snapshot);
  });

  test('rejects a play before trump is called', () => {
    const state = mustCreate(1);
    const [first] = state.hands[state.caller];

    expect(errorCodeOf(state, { type: 'play-card', seat: state.caller, card: first as Card })).toBe(
      'wrong-phase',
    );
  });

  test('rejects a play out of turn', () => {
    expect(
      errorCodeOf(playingState({ hands }), { type: 'play-card', seat: 1, card: card('7H') }),
    ).toBe('not-your-turn');
  });

  test('rejects a card the player does not hold', () => {
    expect(
      errorCodeOf(playingState({ hands }), { type: 'play-card', seat: 0, card: card('KS') }),
    ).toBe('card-not-in-hand');
  });

  test('rejects a malformed card', () => {
    const action = { type: 'play-card', seat: 0, card: { suit: 'hearts', rank: '2' } } as const;

    expect(errorCodeOf(playingState({ hands }), action as never)).toBe('invalid-action');
  });

  test('rejects a card of another suit when the player can follow suit', () => {
    const state = playingState({
      hands,
      turn: 1,
      currentTrick: { leader: 0, plays: [{ seat: 0, card: card('AH') }] },
    });

    expect(errorCodeOf(state, { type: 'play-card', seat: 1, card: card('KC') })).toBe(
      'must-follow-suit',
    );
  });

  test('accepts exactly the legal moves for the first three plays of any deal', () => {
    fc.assert(
      fc.property(
        fc.integer(),
        fc.array(fc.nat(), { minLength: 3, maxLength: 3 }),
        (seed, picks) => {
          const dealt = mustCreate(seed);
          let state = mustApply(dealt, {
            type: 'call-trump',
            seat: dealt.caller,
            suit: 'hearts',
          }).state;

          for (const pick of picks) {
            const seat = state.turn;
            if (seat === null) throw new Error('No seat on turn');
            const legal = legalMoves(state, seat);
            const illegal = state.hands[seat].filter(
              (held) => !legal.some((allowed) => cardEquals(allowed, held)),
            );

            for (const held of illegal) {
              expect(errorCodeOf(state, { type: 'play-card', seat, card: held })).toBe(
                'must-follow-suit',
              );
            }
            const chosen = legal[pick % legal.length] as Card;
            state = mustApply(state, { type: 'play-card', seat, card: chosen }).state;
          }
        },
      ),
    );
  });
});
