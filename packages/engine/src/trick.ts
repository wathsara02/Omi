import { rankValue, type Card, type Suit } from './cards';
import type { Applied } from './events';
import { teamOf, type Seat } from './seats';
import type { GameState, PlayedCard } from './state';

export const TRICK_SIZE = 4;

export type NonEmptyPlays = readonly [PlayedCard, ...PlayedCard[]];

const TRUMP_BONUS = 100;
const CANNOT_WIN = -1;

const strength = (card: Card, ledSuit: Suit, trump: Suit): number => {
  if (card.suit === trump) return TRUMP_BONUS + rankValue(card.rank);
  return card.suit === ledSuit ? rankValue(card.rank) : CANNOT_WIN;
};

/** Highest trump if any were played, otherwise the highest card of the led suit. */
export const trickWinner = (plays: NonEmptyPlays, trump: Suit): Seat => {
  const ledSuit = plays[0].card.suit;
  const best = plays.reduce((leading, play) =>
    strength(play.card, ledSuit, trump) > strength(leading.card, ledSuit, trump) ? play : leading,
  );
  return best.seat;
};

/** Awards a full trick to the winner's team and has the winner lead the next one. */
export const resolveTrick = (
  state: GameState,
  leader: Seat,
  plays: NonEmptyPlays,
  trump: Suit,
): Applied => {
  const winner = trickWinner(plays, trump);
  const team = teamOf(winner);
  return {
    state: {
      ...state,
      tricksWon: { ...state.tricksWon, [team]: state.tricksWon[team] + 1 },
      previousTrick: { leader, plays, winner },
      currentTrick: { leader: winner, plays: [] },
      turn: winner,
    },
    events: [{ type: 'trick-won', winner, team }],
  };
};
