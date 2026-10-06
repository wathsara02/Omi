import type { RoomPlayer } from '@omi/protocol';
import type { ReactElement } from 'react';
import { formatClock, useCountdown } from '../state/clock';
import { Avatar } from '../ui/Avatar';

interface SeatBadgeProps {
  player: RoomPlayer | undefined;
  cardCount: number;
  clockOffset: number;
  isPartner?: boolean;
  isDealer?: boolean;
  isOnTurn?: boolean;
  /** row: avatar beside the text (partner, at the top). stack: avatar above it (sides). */
  layout?: 'row' | 'stack';
}

const cardsText = (count: number): string => (count === 1 ? '1 card' : `${count} cards`);

/** One of the other three players: who they are, and whether they are here. */
export function SeatBadge({
  player,
  cardCount,
  clockOffset,
  isPartner = false,
  isDealer = false,
  isOnTurn = false,
  layout = 'stack',
}: SeatBadgeProps): ReactElement {
  const holdLeft = useCountdown(player?.holdDeadline ?? null, clockOffset);
  const name = player?.name ?? 'Player';
  const isAway = player !== undefined && !player.isConnected && !player.isBot;
  const roles = [isPartner ? 'partner' : null, isDealer ? 'dealer' : null].filter(Boolean);
  const detail = [...roles, cardsText(cardCount)].join(' · ');

  let presence: ReactElement | null = null;
  if (player?.isBot) {
    presence = <span className="pill">bot</span>;
  } else if (isAway) {
    presence = (
      <span className="pill pill--alert">
        {holdLeft === null ? 'away' : `away ${formatClock(holdLeft)}`}
      </span>
    );
  }

  return (
    <div
      className={`seat seat--${layout}${isOnTurn ? ' seat--on-turn' : ''}`}
      aria-label={`${name}${isOnTurn ? ', to play' : ''}`}
      role="group"
    >
      <Avatar name={name} tone={isAway ? 'away' : 'plain'} />
      <div className="seat__text">
        <span className="seat__name">{name}</span>
        <span className="seat__detail">{detail}</span>
        {presence}
      </div>
    </div>
  );
}
