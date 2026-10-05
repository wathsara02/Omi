import type { Card, Suit } from './cards';
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

/** Sent by the server, not by a player, once it is ready to deal again. */
export interface NextRoundAction {
  readonly type: 'next-round';
}

export type Action = CallTrumpAction | PlayCardAction | NextRoundAction;
