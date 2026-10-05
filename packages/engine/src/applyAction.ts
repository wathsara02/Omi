import type { Action } from './actions';
import type { ApplyResult } from './events';
import { callTrump } from './handlers/callTrump';
import { nextRound } from './handlers/nextRound';
import { playCard } from './handlers/playCard';
import { engineError } from './result';
import type { GameState } from './state';

/**
 * The single way to advance a match. Returns a new state plus the public
 * events the action caused, or a typed error; the given state is never changed.
 */
export const applyAction = (state: GameState, action: Action): ApplyResult => {
  if (typeof action !== 'object' || action === null) {
    return engineError('invalid-action', 'An action must be an object');
  }
  switch (action.type) {
    case 'call-trump':
      return callTrump(state, action);
    case 'play-card':
      return playCard(state, action);
    case 'next-round':
      return nextRound(state, action);
    default:
      return engineError('invalid-action', 'Unknown action type');
  }
};
