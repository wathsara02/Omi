import type { Card, Suit } from './cards';
import type { RulesConfig } from './config';
import type { RngState } from './rng';
import type { PerSeat, Seat, Team } from './seats';

export type Phase = 'calling-trump' | 'playing' | 'round-scored' | 'match-over';

export type Hand = readonly Card[];

export type TeamTally = Readonly<Record<Team, number>>;

export const EMPTY_TALLY: TeamTally = { A: 0, B: 0 };

export interface PlayedCard {
  readonly seat: Seat;
  readonly card: Card;
}

export interface Trick {
  readonly leader: Seat;
  readonly plays: readonly PlayedCard[];
}

export interface CompletedTrick extends Trick {
  readonly winner: Seat;
}

export interface RoundResult {
  /** null on a 4–4 tie. */
  readonly winner: Team | null;
  readonly callingTeam: Team;
  readonly tricks: TeamTally;
  readonly isKapothi: boolean;
  readonly baseTokens: number;
  readonly carryOverTokens: number;
  readonly tokensAwarded: number;
}

/**
 * The full, server-side state of a match. It holds every hand, the undealt
 * stock and the rng state, so it must never be sent to a client; use viewFor.
 */
export interface GameState {
  readonly config: RulesConfig;
  readonly rng: RngState;
  readonly phase: Phase;
  readonly roundNumber: number;
  readonly dealer: Seat;
  readonly caller: Seat;
  readonly trump: Suit | null;
  readonly hands: PerSeat<Hand>;
  /** Cards not yet dealt: the second batch, held back until trump is called. */
  readonly stock: readonly Card[];
  /** The seat that must act next, or null between rounds and after the match. */
  readonly turn: Seat | null;
  readonly currentTrick: Trick | null;
  readonly previousTrick: CompletedTrick | null;
  readonly tricksWon: TeamTally;
  readonly tokens: TeamTally;
  /** Extra tokens the winner of the next decided round receives. */
  readonly carryOver: number;
  readonly lastRound: RoundResult | null;
  readonly winner: Team | null;
}
