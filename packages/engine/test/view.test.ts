import { describe, expect, test } from 'vitest';
import { cardKey } from '../src/cards';
import { SEATS } from '../src/seats';
import type { GameState } from '../src/state';
import { viewFor } from '../src/view';
import {
  card,
  cards,
  collectCards,
  collectKeys,
  mustApply,
  mustCreate,
  playLastTrick,
  playingState,
} from './helpers';

const HIDDEN_KEYS = ['rng', 'stock', 'hands'];

const midTrick = (): GameState =>
  playingState({
    hands: [cards('7C 8C'), cards('7H KC'), cards('8H 8D'), cards('9H 9D')],
    turn: 1,
    currentTrick: { leader: 0, plays: [{ seat: 0, card: card('AH') }] },
    previousTrick: {
      leader: 2,
      winner: 0,
      plays: [
        { seat: 2, card: card('QD') },
        { seat: 3, card: card('JD') },
        { seat: 0, card: card('AD') },
        { seat: 1, card: card('10D') },
      ],
    },
    tricksWon: { A: 1, B: 0 },
    tokens: { A: 2, B: 3 },
    carryOver: 1,
  });

const statesInEveryPhase = (): readonly GameState[] => {
  const dealt = mustCreate(11);
  const called = mustApply(dealt, { type: 'call-trump', seat: dealt.caller, suit: 'hearts' }).state;
  return [
    dealt,
    called,
    midTrick(),
    playLastTrick().state,
    playLastTrick({ tokens: { A: 9, B: 0 } }).state,
  ];
};

describe('viewFor', () => {
  test('shows a player their own hand', () => {
    expect(viewFor(midTrick(), 1).hand).toEqual(cards('7H KC'));
  });

  test('shows other players only as card counts', () => {
    expect(viewFor(midTrick(), 1).handCounts).toEqual([2, 2, 2, 2]);
  });

  test('says which seat and team the view is for', () => {
    expect(viewFor(midTrick(), 3)).toMatchObject({ seat: 3, team: 'B' });
  });

  test('shows the current and previous tricks, trump, trick counts and tokens', () => {
    const state = midTrick();

    expect(viewFor(state, 2)).toMatchObject({
      currentTrick: state.currentTrick,
      previousTrick: state.previousTrick,
      trump: 'spades',
      tricksWon: { A: 1, B: 0 },
      tokens: { A: 2, B: 3 },
    });
  });

  test('shows the public table state', () => {
    const state = midTrick();

    expect(viewFor(state, 2)).toMatchObject({
      phase: 'playing',
      roundNumber: state.roundNumber,
      dealer: 3,
      caller: 0,
      turn: 1,
      carryOver: 1,
      lastRound: null,
      winner: null,
      config: state.config,
    });
  });

  test('lists the legal moves for the seat on turn and none for anyone else', () => {
    const state = midTrick();

    expect(viewFor(state, 1).legalMoves).toEqual(cards('7H'));
    expect(viewFor(state, 0).legalMoves).toEqual([]);
  });

  test('shows the round result and the winner once the match is over', () => {
    const { state } = playLastTrick({ tokens: { A: 9, B: 0 } });

    expect(viewFor(state, 1)).toMatchObject({
      phase: 'match-over',
      winner: 'A',
      lastRound: state.lastRound,
    });
  });

  test('has exactly the documented fields', () => {
    expect(Object.keys(viewFor(midTrick(), 0)).sort()).toEqual(
      [
        'caller',
        'carryOver',
        'config',
        'currentTrick',
        'dealer',
        'hand',
        'handCounts',
        'lastRound',
        'legalMoves',
        'phase',
        'previousTrick',
        'roundNumber',
        'seat',
        'team',
        'tokens',
        'tricksWon',
        'trump',
        'turn',
        'winner',
      ].sort(),
    );
  });

  test('never contains the rng state, the stock or the full hands, for any seat in any phase', () => {
    for (const state of statesInEveryPhase()) {
      for (const seat of SEATS) {
        const keys = collectKeys(viewFor(state, seat));

        expect(keys.filter((key) => HIDDEN_KEYS.includes(key))).toEqual([]);
      }
    }
  });

  test('never contains a card outside the player’s own hand and the two visible tricks', () => {
    for (const state of statesInEveryPhase()) {
      for (const seat of SEATS) {
        const visible = new Set(
          collectCards([state.hands[seat], state.currentTrick, state.previousTrick]).map(cardKey),
        );

        const shown = collectCards(viewFor(state, seat)).map(cardKey);

        expect(shown.filter((key) => !visible.has(key))).toEqual([]);
      }
    }
  });

  test('shows nobody a card from the stock before trump is called', () => {
    const dealt = mustCreate(11);
    const stock = new Set(dealt.stock.map(cardKey));

    for (const seat of SEATS) {
      const shown = collectCards(viewFor(dealt, seat)).map(cardKey);

      expect(shown.filter((key) => stock.has(key))).toEqual([]);
    }
  });

  test('does not change when only hidden information changes', () => {
    const state = midTrick();
    const hiddenChanged: GameState = {
      ...state,
      rng: state.rng + 1,
      stock: cards('AS KS'),
      hands: [state.hands[0], state.hands[1], cards('JC QC'), cards('JS QS')],
    };

    expect(viewFor(hiddenChanged, 0)).toEqual(viewFor(state, 0));
    expect(viewFor(hiddenChanged, 1)).toEqual(viewFor(state, 1));
  });
});
