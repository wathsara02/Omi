import type { NextRoundAction } from '../actions';
import { startRound } from '../deal';
import type { ApplyResult } from '../events';
import { engineError, ok } from '../result';
import { isSeed, seedRng } from '../rng';
import { nextSeat } from '../seats';
import type { GameState } from '../state';

export const nextRound = (state: GameState, action: NextRoundAction): ApplyResult => {
  if (state.phase !== 'round-scored') {
    return engineError('wrong-phase', 'The next round starts only after a round is scored');
  }
  if (!isSeed(action.seed)) {
    return engineError('invalid-action', 'A seed must be four unsigned 32-bit integers');
  }

  // The deal passes to the next player in turn order, who was this round's trump caller.
  const next = startRound({
    config: state.config,
    rng: seedRng(action.seed),
    dealer: nextSeat(state.dealer, state.config.turnOrder),
    tokens: state.tokens,
    carryOver: state.carryOver,
    roundNumber: state.roundNumber + 1,
  });
  return ok({
    state: next,
    events: [
      {
        type: 'round-started',
        roundNumber: next.roundNumber,
        dealer: next.dealer,
        caller: next.caller,
      },
    ],
  });
};
