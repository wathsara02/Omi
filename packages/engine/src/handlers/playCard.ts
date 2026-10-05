import type { PlayCardAction } from '../actions';
import { cardEquals, isCard, type Card, type Suit } from '../cards';
import type { Applied, ApplyResult, GameEvent } from '../events';
import { ledSuitOf, legalCards } from '../legalMoves';
import { engineError, ok, type EngineError, type Result } from '../result';
import { finishRound, isRoundComplete } from '../scoring';
import { mapSeats, nextSeat, type Seat } from '../seats';
import type { GameState, Hand, Trick } from '../state';
import { TRICK_SIZE, resolveTrick, type NonEmptyPlays } from '../trick';

interface ValidPlay {
  readonly seat: Seat;
  readonly card: Card;
  readonly hand: Hand;
  readonly trick: Trick;
  readonly trump: Suit;
}

const holds = (hand: Hand, card: Card): boolean => hand.some((held) => cardEquals(held, card));

const validatePlay = (state: GameState, action: PlayCardAction): Result<ValidPlay, EngineError> => {
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
  return ok({ seat, card, hand, trick, trump });
};

/** Resolves a full trick and, if it was the eighth, scores the round. */
const completeTrick = (
  state: GameState,
  leader: Seat,
  plays: NonEmptyPlays,
  trump: Suit,
): Applied => {
  const resolved = resolveTrick(state, leader, plays, trump);
  if (!isRoundComplete(resolved.state)) return resolved;

  const finished = finishRound(resolved.state);
  return { state: finished.state, events: [...resolved.events, ...finished.events] };
};

export const playCard = (state: GameState, action: PlayCardAction): ApplyResult => {
  const validated = validatePlay(state, action);
  if (!validated.ok) return validated;
  const { seat, card, hand, trick, trump } = validated.value;

  const played = { seat, card };
  const [lead = played, ...followers] = [...trick.plays, played];
  const plays: NonEmptyPlays = [lead, ...followers];
  const afterPlay: GameState = {
    ...state,
    hands: mapSeats((each) =>
      each === seat ? hand.filter((held) => !cardEquals(held, card)) : state.hands[each],
    ),
    currentTrick: { leader: trick.leader, plays },
  };
  const cardPlayed: GameEvent = { type: 'card-played', ...played };

  if (plays.length < TRICK_SIZE) {
    const turn = nextSeat(seat, state.config.turnOrder);
    return ok({ state: { ...afterPlay, turn }, events: [cardPlayed] });
  }
  const completed = completeTrick(afterPlay, trick.leader, plays, trump);
  return ok({ state: completed.state, events: [cardPlayed, ...completed.events] });
};
