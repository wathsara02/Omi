import type { Suit } from './cards';
import type { RulesConfig } from './config';
import { legalMoves } from './legalMoves';
import { mapSeats, teamOf, type PerSeat, type Seat, type Team } from './seats';
import type {
  CompletedTrick,
  GameState,
  Hand,
  Phase,
  RoundResult,
  TeamTally,
  Trick,
} from './state';

/** What one player is allowed to know. The only game data that may be sent to a client. */
export interface PlayerView {
  readonly seat: Seat;
  readonly team: Team;
  readonly phase: Phase;
  readonly roundNumber: number;
  readonly config: RulesConfig;
  readonly dealer: Seat;
  readonly caller: Seat;
  readonly trump: Suit | null;
  readonly turn: Seat | null;
  readonly hand: Hand;
  /** The cards this player may play now; empty unless it is their turn to play. */
  readonly legalMoves: Hand;
  /** How many cards each seat holds. Other players' cards are never included. */
  readonly handCounts: PerSeat<number>;
  readonly currentTrick: Trick | null;
  readonly previousTrick: CompletedTrick | null;
  readonly tricksWon: TeamTally;
  readonly tokens: TeamTally;
  readonly carryOver: number;
  readonly lastRound: RoundResult | null;
  readonly winner: Team | null;
}

/**
 * Builds the view for one seat. Every field is copied by name, never by
 * spreading the state, so the rng state, the stock and the other hands cannot
 * leak when a field is later added to GameState.
 */
export const viewFor = (state: GameState, seat: Seat): PlayerView => ({
  seat,
  team: teamOf(seat),
  phase: state.phase,
  roundNumber: state.roundNumber,
  config: state.config,
  dealer: state.dealer,
  caller: state.caller,
  trump: state.trump,
  turn: state.turn,
  hand: state.hands[seat],
  legalMoves: legalMoves(state, seat),
  handCounts: mapSeats((each) => state.hands[each].length),
  currentTrick: state.currentTrick,
  previousTrick: state.previousTrick,
  tricksWon: state.tricksWon,
  tokens: state.tokens,
  carryOver: state.carryOver,
  lastRound: state.lastRound,
  winner: state.winner,
});
