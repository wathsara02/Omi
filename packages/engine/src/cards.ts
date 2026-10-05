export const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'] as const;
export type Suit = (typeof SUITS)[number];

/** Low to high, so a rank's index is its strength within a suit. */
export const RANKS = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;
export type Rank = (typeof RANKS)[number];

export interface Card {
  readonly suit: Suit;
  readonly rank: Rank;
}

export const rankValue = (rank: Rank): number => RANKS.indexOf(rank);

export const createDeck = (): readonly Card[] =>
  SUITS.flatMap((suit) => RANKS.map((rank) => ({ suit, rank })));

export const cardEquals = (a: Card, b: Card): boolean => a.suit === b.suit && a.rank === b.rank;

export const cardKey = (card: Card): string => `${card.rank}-${card.suit}`;

export const isSuit = (value: unknown): value is Suit =>
  (SUITS as readonly unknown[]).includes(value);

const isRank = (value: unknown): value is Rank => (RANKS as readonly unknown[]).includes(value);

export const isCard = (value: unknown): value is Card => {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { suit?: unknown; rank?: unknown };
  return isSuit(candidate.suit) && isRank(candidate.rank);
};
