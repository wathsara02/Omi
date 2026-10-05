import type { Suit } from './cards';
import type { EngineError, Result } from './result';
import type { Seat } from './seats';
import type { GameState } from './state';

/**
 * Things every player at the table may know about. Events are broadcast to
 * all four seats, so they must never carry a card that has not been played.
 */
export type GameEvent = {
  readonly type: 'trump-called';
  readonly seat: Seat;
  readonly suit: Suit;
};

export interface Applied {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

export type ApplyResult = Result<Applied, EngineError>;
