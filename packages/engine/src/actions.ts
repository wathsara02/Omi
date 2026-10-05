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

export type Action = CallTrumpAction | PlayCardAction;
