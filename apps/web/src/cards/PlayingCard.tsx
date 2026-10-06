import type { Card } from '@omi/engine';
import type { CSSProperties, ReactElement } from 'react';
import { cardName, isRedSuit } from './cardNames';
import { SuitIcon } from './SuitIcon';
import './card.css';

export type CardSize = 'hand' | 'table' | 'large';

/**
 * idle: just shown. playable: a button the player can press. dimmed: in hand
 * but not legal right now. winner: the card that took the trick.
 */
export type CardState = 'idle' | 'playable' | 'dimmed' | 'winner';

interface PlayingCardProps {
  card: Card;
  size?: CardSize;
  state?: CardState;
  /** Degrees of rotation, for cards lying on the table. */
  tilt?: number;
  /** Who played it, added to the accessible name ("King of hearts, played by Nimal"). */
  note?: string;
  onPlay?: (card: Card) => void;
}

const ICON_SIZE: Readonly<Record<CardSize, number>> = { hand: 20, table: 20, large: 26 };

export function PlayingCard({
  card,
  size = 'table',
  state = 'idle',
  tilt = 0,
  note,
  onPlay,
}: PlayingCardProps): ReactElement {
  const className = [
    'card',
    `card--${size}`,
    `card--${state}`,
    isRedSuit(card.suit) ? 'card--red' : 'card--black',
  ].join(' ');
  const style = { '--card-tilt': `${tilt}deg` } as CSSProperties;
  const face = (
    <>
      <span className="card__rank">{card.rank}</span>
      <SuitIcon suit={card.suit} size={ICON_SIZE[size]} />
    </>
  );
  const name = note ? `${cardName(card)}, ${note}` : cardName(card);

  if (state === 'playable' || state === 'dimmed') {
    const isPlayable = state === 'playable';
    return (
      <button
        type="button"
        className={className}
        style={style}
        disabled={!isPlayable}
        aria-label={`${name}, ${isPlayable ? 'playable' : 'not playable'}`}
        onClick={() => onPlay?.(card)}
      >
        {face}
      </button>
    );
  }
  return (
    <div className={className} style={style} role="img" aria-label={name}>
      {face}
    </div>
  );
}
