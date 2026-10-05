import type { PlayCardAction } from '../actions';
import { cardEquals, isCard, type Card } from '../cards';
import type { ApplyResult } from '../events';
import { ledSuitOf, legalCards } from '../legalMoves';
import { engineError, ok } from '../result';
import { mapSeats, nextSeat } from '../seats';
import type { GameState, Hand } from '../state';

const holds = (hand: Hand, card: Card): boolean => hand.some((held) => cardEquals(held, card));

export const playCard = (state: GameState, action: PlayCardAction): ApplyResult => {
  const trick = state.currentTrick;
  if (state.phase !== 'playing' || trick === null || state.turn === null) {
    return engineError('wrong-phase', 'Cards can only be played once trump is called');
  }
  if (action.seat !== state.turn) {
    return engineError('not-your-turn', 'It is not this seat’s turn to play');
  }
  const { seat, card } = action;
  if (!isCard(card)) {
    return engineError('invalid-action', 'Not a card from the 32-card deck');
  }
  const hand = state.hands[seat];
  if (!holds(hand, card)) {
    return engineError('card-not-in-hand', 'The player does not hold that card');
  }
  if (!holds(legalCards(hand, ledSuitOf(trick)), card)) {
    return engineError('must-follow-suit', 'A card of the led suit must be played');
  }

  const played = { seat, card };
  return ok({
    state: {
      ...state,
      hands: mapSeats((each) =>
        each === seat ? hand.filter((held) => !cardEquals(held, card)) : state.hands[each],
      ),
      currentTrick: { ...trick, plays: [...trick.plays, played] },
      turn: nextSeat(seat, state.config.turnOrder),
    },
    events: [{ type: 'card-played', ...played }],
  });
};
