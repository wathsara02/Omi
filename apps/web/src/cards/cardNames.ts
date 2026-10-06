import type { Card, Rank, Suit } from '@omi/engine';

const RANK_NAMES: Readonly<Record<Rank, string>> = {
  '7': 'Seven',
  '8': 'Eight',
  '9': 'Nine',
  '10': 'Ten',
  J: 'Jack',
  Q: 'Queen',
  K: 'King',
  A: 'Ace',
};

const SUIT_NAMES: Readonly<Record<Suit, string>> = {
  clubs: 'Clubs',
  diamonds: 'Diamonds',
  hearts: 'Hearts',
  spades: 'Spades',
};

export const suitName = (suit: Suit): string => SUIT_NAMES[suit];

/** "Ace of hearts", for screen readers and tooltips. */
export const cardName = (card: Card): string =>
  `${RANK_NAMES[card.rank]} of ${SUIT_NAMES[card.suit].toLowerCase()}`;

export const isRedSuit = (suit: Suit): boolean => suit === 'hearts' || suit === 'diamonds';
