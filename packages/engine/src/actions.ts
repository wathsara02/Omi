import type { Suit } from './cards';
import type { Seat } from './seats';

export interface CallTrumpAction {
  readonly type: 'call-trump';
  readonly seat: Seat;
  readonly suit: Suit;
}

export type Action = CallTrumpAction;
