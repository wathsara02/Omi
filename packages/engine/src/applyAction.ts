import type { Action } from './actions';
import type { ApplyResult } from './events';
import { callTrump } from './handlers/callTrump';
import { engineError } from './result';
import type { GameState } from './state';

/**
 * The single way to advance a match. Returns a new state plus the public
 * events the action caused, or a typed error; the given state is never changed.
 */
export const applyAction = (state: GameState, action: Action): ApplyResult => {
  switch (action.type) {
    case 'call-trump':
      return callTrump(state, action);
    default:
      return engineError('invalid-action', 'Unknown action type');
  }
};
