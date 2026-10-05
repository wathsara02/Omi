import type { Action } from '../src/actions';
import { applyAction } from '../src/applyAction';
import { isCard, type Card, type Suit } from '../src/cards';
import { DEFAULT_RULES, type RulesConfig } from '../src/config';
import { createMatch } from '../src/deal';
import type { Applied, GameEvent } from '../src/events';
import type { EngineErrorCode } from '../src/result';
import type { Seat } from '../src/seats';
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

export interface Played {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

/** Plays cards given as [seat, shorthand] pairs, collecting every event. */
export const playSequence = (
  state: GameState,
  sequence: readonly (readonly [Seat, string])[],
): Played =>
  sequence.reduce<Played>(
    (current, [seat, text]) => {
      const applied = mustApply(current.state, { type: 'play-card', seat, card: card(text) });
      return { state: applied.state, events: [...current.events, ...applied.events] };
    },
    { state, events: [] },
  );

/**
 * Plays the eighth trick of a round from a state where Team A has 4 tricks and
 * Team B has 3. Seat 0 leads the ace of hearts and wins, so Team A (the calling
 * team) takes the round 5–3, unless `lastCard` is a trump for seat 3.
 */
export const playLastTrick = (overrides: Partial<GameState> = {}, lastCard = '9H'): Played =>
  playSequence(
    playingState({
      hands: [cards('AH'), cards('7H'), cards('8H'), cards(lastCard)],
      tricksWon: { A: 4, B: 3 },
      ...overrides,
    }),
    [
      [0, 'AH'],
      [1, '7H'],
      [2, '8H'],
      [3, lastCard],
    ],
  );

const childrenOf = (value: unknown): readonly unknown[] => {
  if (Array.isArray(value)) return value;
  return typeof value === 'object' && value !== null ? Object.values(value) : [];
};

/** Every card object found anywhere inside a value, however deeply nested. */
export const collectCards = (value: unknown): Card[] =>
  isCard(value) ? [value] : childrenOf(value).flatMap(collectCards);

/** Every object key found anywhere inside a value, however deeply nested. */
export const collectKeys = (value: unknown): string[] => {
  const ownKeys =
    typeof value === 'object' && value !== null && !Array.isArray(value) ? Object.keys(value) : [];
  return [...ownKeys, ...childrenOf(value).flatMap(collectKeys)];
};

/** Freezes a value and everything inside it, so any attempt to mutate it throws. */
export const deepFreeze = <T>(value: T): T => {
  childrenOf(value).forEach(deepFreeze);
  return Object.freeze(value);
};
