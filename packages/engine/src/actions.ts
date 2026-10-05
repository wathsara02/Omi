import type { Card, Suit } from './cards';
import type { Seed } from './rng';
import type { Seat } from './seats';

export interface CallTrumpAction {
  readonly type: 'call-trump';
  readonly seat: Seat;
  readonly suit: Suit;
}

export interface PlayCardAction {
  readonly type: 'play-card';
  readonly seat: Seat;
  readonly card: Card;
}

/**
 * Sent by the server, not by a player, once it is ready to deal again. Each
 * round is shuffled from its own fresh seed, so one round's cards reveal
 * nothing about the next deal.
 */
export interface NextRoundAction {
  readonly type: 'next-round';
  readonly seed: Seed;
}

export type Action = CallTrumpAction | PlayCardAction | NextRoundAction;
