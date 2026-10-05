import type { Action } from '../src/actions';
import { applyAction } from '../src/applyAction';
import { applyAutoAction } from '../src/auto';
import { SUITS, type Card, type Suit } from '../src/cards';
import type { Applied, ApplyResult, GameEvent } from '../src/events';
import { legalMoves } from '../src/legalMoves';
import { randomInt, seedRng, type RngState } from '../src/rng';
import type { GameState } from '../src/state';
import { mustCreate } from './helpers';

/** Far more actions than any real match needs; guards against a driver that never ends. */
const MAX_STEPS = 20_000;

export interface Step {
  readonly before: GameState;
  readonly after: GameState;
  readonly events: readonly GameEvent[];
}

export interface PlayedMatch {
  readonly finalState: GameState;
  readonly steps: readonly Step[];
}

type Chooser = (state: GameState, rng: RngState) => { result: ApplyResult; rng: RngState };

const unwrap = (result: ApplyResult): Applied => {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.value;
};

const randomAction = (state: GameState, rng: RngState): { action: Action; rng: RngState } => {
  if (state.phase === 'calling-trump') {
    const pick = randomInt(rng, SUITS.length);
    return {
      action: { type: 'call-trump', seat: state.caller, suit: SUITS[pick.value] as Suit },
      rng: pick.state,
    };
  }
  if (state.phase === 'playing' && state.turn !== null) {
    const legal = legalMoves(state, state.turn);
    const pick = randomInt(rng, legal.length);
    return {
      action: { type: 'play-card', seat: state.turn, card: legal[pick.value] as Card },
      rng: pick.state,
    };
  }
  return { action: { type: 'next-round' }, rng };
};

const chooseRandomly: Chooser = (state, rng) => {
  const chosen = randomAction(state, rng);
  return { result: applyAction(state, chosen.action), rng: chosen.rng };
};

const chooseAutomatically: Chooser = (state, rng) => ({
  result:
    state.phase === 'round-scored'
      ? applyAction(state, { type: 'next-round' })
      : applyAutoAction(state),
  rng,
});

const playMatch = (seed: number, choiceSeed: number, choose: Chooser): PlayedMatch => {
  const steps: Step[] = [];
  let state = mustCreate(seed);
  let rng = seedRng(choiceSeed);
  while (state.phase !== 'match-over') {
    if (steps.length >= MAX_STEPS) throw new Error('Match did not finish');
    const chosen = choose(state, rng);
    const applied = unwrap(chosen.result);
    steps.push({ before: state, after: applied.state, events: applied.events });
    state = applied.state;
    rng = chosen.rng;
  }
  return { finalState: state, steps };
};

/** A whole match in which every player picks a random legal action. */
export const playRandomMatch = (seed: number, choiceSeed: number): PlayedMatch =>
  playMatch(seed, choiceSeed, chooseRandomly);

/** A whole match played only by the timeout and bot auto-actions. */
export const playAutoMatch = (seed: number): PlayedMatch => playMatch(seed, 0, chooseAutomatically);
