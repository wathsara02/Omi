import type { PlayCardAction } from '../actions';
import { cardEquals, isCard, type Card } from '../cards';
import type { ApplyResult, GameEvent } from '../events';
import { ledSuitOf, legalCards } from '../legalMoves';
import { engineError, ok } from '../result';
import { mapSeats, nextSeat } from '../seats';
import type { GameState, Hand } from '../state';
import { TRICK_SIZE, resolveTrick } from '../trick';

const holds = (hand: Hand, card: Card): boolean => hand.some((held) => cardEquals(held, card));

export const playCard = (state: GameState, action: PlayCardAction): ApplyResult => {
  const { currentTrick: trick, trump } = state;
  if (state.phase !== 'playing' || trick === null || trump === null || state.turn === null) {
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
  const [lead = played, ...followers] = [...trick.plays, played];
  const afterPlay: GameState = {
    ...state,
    hands: mapSeats((each) =>
      each === seat ? hand.filter((held) => !cardEquals(held, card)) : state.hands[each],
    ),
    currentTrick: { leader: trick.leader, plays: [lead, ...followers] },
  };
  const cardPlayed: GameEvent = { type: 'card-played', ...played };

  if (followers.length + 1 < TRICK_SIZE) {
    const turn = nextSeat(seat, state.config.turnOrder);
    return ok({ state: { ...afterPlay, turn }, events: [cardPlayed] });
  }
  const resolved = resolveTrick(afterPlay, trick.leader, [lead, ...followers], trump);
  return ok({ state: resolved.state, events: [cardPlayed, ...resolved.events] });
};
