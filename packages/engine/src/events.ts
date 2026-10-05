import type { Card, Suit } from './cards';
import type { EngineError, Result } from './result';
import type { Seat, Team } from './seats';
import type { GameState, RoundResult, TeamTally } from './state';

/**
 * Things every player at the table may know about. Events are broadcast to
 * all four seats, so they must never carry a card that has not been played.
 */
export type GameEvent =
  | { readonly type: 'trump-called'; readonly seat: Seat; readonly suit: Suit }
  | { readonly type: 'card-played'; readonly seat: Seat; readonly card: Card }
  | { readonly type: 'trick-won'; readonly winner: Seat; readonly team: Team }
  | { readonly type: 'round-scored'; readonly result: RoundResult; readonly tokens: TeamTally }
  | { readonly type: 'match-won'; readonly winner: Team; readonly tokens: TeamTally }
  | {
      readonly type: 'round-started';
      readonly roundNumber: number;
      readonly dealer: Seat;
      readonly caller: Seat;
    };

export interface Applied {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

export type ApplyResult = Result<Applied, EngineError>;
