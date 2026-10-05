import type { CallTrumpAction } from '../actions';
import { isSuit } from '../cards';
import { dealBatch } from '../deal';
import type { ApplyResult } from '../events';
import { engineError, ok } from '../result';
import type { GameState } from '../state';

export const callTrump = (state: GameState, action: CallTrumpAction): ApplyResult => {
  if (state.phase !== 'calling-trump') {
    return engineError('wrong-phase', 'Trump can only be called at the start of a round');
  }
  if (action.seat !== state.caller) {
    return engineError('not-trump-caller', 'Only the trump caller may name trump');
  }
  if (!isSuit(action.suit)) {
    return engineError('invalid-action', 'Trump must be one of the four suits');
  }

  const dealt = dealBatch(state.hands, state.stock, state.caller, state.config.turnOrder);
  return ok({
    state: {
      ...state,
      phase: 'playing',
      trump: action.suit,
      hands: dealt.hands,
      stock: dealt.stock,
      turn: state.caller,
      currentTrick: { leader: state.caller, plays: [] },
    },
    events: [{ type: 'trump-called', seat: state.caller, suit: action.suit }],
  });
};
