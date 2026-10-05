import type { Action } from '../src/actions';
import { applyAction } from '../src/applyAction';
import { isCard, type Card, type Suit } from '../src/cards';
import { DEFAULT_RULES, type RulesConfig } from '../src/config';
import { createMatch } from '../src/deal';
import type { Applied } from '../src/events';
import type { EngineErrorCode } from '../src/result';
import type { GameState } from '../src/state';

export const mustCreate = (seed: number, config: RulesConfig = DEFAULT_RULES): GameState => {
  const result = createMatch(config, seed);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};

export const mustApply = (state: GameState, action: Action): Applied => {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.value;
};

const SUIT_BY_LETTER: Readonly<Record<string, Suit>> = {
  C: 'clubs',
  D: 'diamonds',
  H: 'hearts',
  S: 'spades',
};

/** Parses shorthand such as "AH" (ace of hearts) or "10S" (ten of spades). */
export const card = (text: string): Card => {
  const parsed = { suit: SUIT_BY_LETTER[text.slice(-1)], rank: text.slice(0, -1) };
  if (!isCard(parsed)) throw new Error(`Not a card: ${text}`);
  return parsed;
};

export const cards = (text: string): Card[] => (text === '' ? [] : text.split(' ').map(card));

/**
 * A playing-phase state with fixed seating: seat 3 dealt, seat 0 called trump
 * (so Team A is the calling team) and seat 0 is about to lead. Spades are
 * trump unless overridden.
 */
export const playingState = (overrides: Partial<GameState> = {}): GameState => {
  const dealt = mustCreate(1);
  const { state } = mustApply(dealt, { type: 'call-trump', seat: dealt.caller, suit: 'spades' });
  return {
    ...state,
    dealer: 3,
    caller: 0,
    turn: 0,
    currentTrick: { leader: 0, plays: [] },
    ...overrides,
  };
};

export const errorCodeOf = (state: GameState, action: Action): EngineErrorCode | null => {
  const result = applyAction(state, action);
  return result.ok ? null : result.error.code;
};
