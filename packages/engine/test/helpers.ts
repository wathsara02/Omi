import type { Action } from '../src/actions';
import { applyAction } from '../src/applyAction';
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

export const errorCodeOf = (state: GameState, action: Action): EngineErrorCode | null => {
  const result = applyAction(state, action);
  return result.ok ? null : result.error.code;
};
