import { startRound } from '../deal';
import type { ApplyResult } from '../events';
import { engineError, ok } from '../result';
import { nextSeat } from '../seats';
import type { GameState } from '../state';

export const nextRound = (state: GameState): ApplyResult => {
  if (state.phase !== 'round-scored') {
    return engineError('wrong-phase', 'The next round starts only after a round is scored');
  }

  // The deal passes to the next player in turn order, who was this round's trump caller.
  const next = startRound({
    config: state.config,
    rng: state.rng,
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
