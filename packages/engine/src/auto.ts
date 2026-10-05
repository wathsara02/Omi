import { SUITS, rankValue, type Card, type Suit } from './cards';
import type { ApplyResult } from './events';
import { callTrump } from './handlers/callTrump';
import { playCard } from './handlers/playCard';
import { legalMoves } from './legalMoves';
import { engineError } from './result';
import { randomInt, type RandomStep, type RngState } from './rng';
import type { GameState, Hand } from './state';

/**
 * Lower sorts first: rank, then non-trump before trump, then the fixed suit
 * order clubs, diamonds, hearts, spades.
 */
const compareForAutoPlay = (a: Card, b: Card, trump: Suit): number =>
  rankValue(a.rank) - rankValue(b.rank) ||
  Number(a.suit === trump) - Number(b.suit === trump) ||
  SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);

/** The "lowest legal card" the rules play for a seat that runs out of time. */
export const pickAutoCard = (legal: readonly [Card, ...Card[]], trump: Suit): Card =>
  legal.reduce((lowest, card) => (compareForAutoPlay(card, lowest, trump) < 0 ? card : lowest));

/** The suit held most; ties are broken at random, which advances the rng. */
export const pickAutoTrump = (hand: Hand, rng: RngState): RandomStep<Suit> => {
  const countOf = (suit: Suit): number => hand.filter((card) => card.suit === suit).length;
  const most = Math.max(...SUITS.map(countOf));
  const tied = SUITS.filter((suit) => countOf(suit) === most);
  if (tied.length === 1) return { value: tied[0] as Suit, state: rng };

  const pick = randomInt(rng, tied.length);
  return { value: tied[pick.value] as Suit, state: pick.state };
};

/**
 * Acts for whoever must act next, the way a timeout or a bot does: the caller's
 * most-held suit as trump, or the lowest legal card.
 */
export const applyAutoAction = (state: GameState): ApplyResult => {
  if (state.phase === 'calling-trump') {
    const pick = pickAutoTrump(state.hands[state.caller], state.rng);
    return callTrump(
      { ...state, rng: pick.state },
      { type: 'call-trump', seat: state.caller, suit: pick.value },
    );
  }
  if (state.phase === 'playing' && state.turn !== null && state.trump !== null) {
    const [first, ...rest] = legalMoves(state, state.turn);
    if (first === undefined) return engineError('invalid-action', 'No card to play');
    const card = pickAutoCard([first, ...rest], state.trump);
    return playCard(state, { type: 'play-card', seat: state.turn, card });
  }
  return engineError('wrong-phase', 'Nobody has to act right now');
};
