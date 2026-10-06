import type { Suit } from '@omi/engine';
import type { ReactElement } from 'react';

interface SuitIconProps {
  suit: Suit;
  size?: number;
}

const DEFAULT_SIZE = 20;

const SHAPES: Readonly<Record<Suit, ReactElement>> = {
  hearts: (
    <path d="M12 21C5 15 2 11.5 2 7.8A4.8 4.8 0 0 1 12 6a4.8 4.8 0 0 1 10 1.8C22 11.5 19 15 12 21Z" />
  ),
  spades: (
    <path d="M12 2C8 7 3 10 3 14.5A4.5 4.5 0 0 0 11 17.4L9.5 22h5L13 17.4A4.5 4.5 0 0 0 21 14.5C21 10 16 7 12 2Z" />
  ),
  diamonds: <path d="M12 2 20 12 12 22 4 12Z" />,
  clubs: (
    <>
      <circle cx="12" cy="7" r="4.2" />
      <circle cx="6.5" cy="14" r="4.2" />
      <circle cx="17.5" cy="14" r="4.2" />
      <path d="M10 22h4l-1.2-6h-1.6Z" />
    </>
  ),
};

/** Decorative: the element that uses it carries the accessible name. */
export function SuitIcon({ suit, size = DEFAULT_SIZE }: SuitIconProps): ReactElement {
  return (
    <svg
      className="suit-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      data-suit={suit}
    >
      {SHAPES[suit]}
    </svg>
  );
}
