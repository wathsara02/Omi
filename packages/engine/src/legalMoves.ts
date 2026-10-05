import type { Suit } from './cards';
import type { Seat } from './seats';
import type { GameState, Hand, Trick } from './state';

export const ledSuitOf = (trick: Trick | null): Suit | null => trick?.plays[0]?.card.suit ?? null;

/** Follow suit if possible; otherwise any card, with no obligation to trump. */
export const legalCards = (hand: Hand, ledSuit: Suit | null): Hand => {
  if (ledSuit === null) return hand;
  const following = hand.filter((card) => card.suit === ledSuit);
  return following.length > 0 ? following : hand;
};

/** The cards `seat` may play right now; empty unless it is their turn to play. */
export const legalMoves = (state: GameState, seat: Seat): Hand =>
  state.phase === 'playing' && state.turn === seat
    ? legalCards(state.hands[seat], ledSuitOf(state.currentTrick))
    : [];
