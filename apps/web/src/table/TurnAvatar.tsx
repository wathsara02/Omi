import type { ReactElement } from 'react';
import { useCountdown } from '../state/clock';

/** When the seat on turn will be played for, and when that countdown began (server time). */
export interface TurnClock {
  readonly deadline: number;
  readonly startedAt: number;
}

interface TurnAvatarProps {
  name: string;
  /** table: on the green table. sheet: on the white sheet (the player's own). */
  tone: 'table' | 'sheet';
  isOnTurn: boolean;
  /** Set when this seat's turn has a countdown; a bot's turn has none. */
  clock: TurnClock | null;
  clockOffset: number;
  isAway?: boolean;
  /** Show the seconds left in place of the initial. Only for the player's own avatar. */
  showSeconds?: boolean;
}

const RING_RADIUS = 25;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;
const URGENT_MS = 5000;
const MS_PER_SECOND = 1000;

/**
 * A player's initial in a circle. On their turn it pulses, and when the turn
 * has a countdown a ring drains around it. Decorative apart from the ring: the
 * seat that uses it carries the name and "to play" for screen readers.
 */
export function TurnAvatar({
  name,
  tone,
  isOnTurn,
  clock,
  clockOffset,
  isAway = false,
  showSeconds = false,
}: TurnAvatarProps): ReactElement {
  const remaining = useCountdown(isOnTurn && clock ? clock.deadline : null, clockOffset);
  // Array.from keeps a letter with its accents in one piece.
  const initial = Array.from(name.trim())[0]?.toUpperCase() ?? '?';

  const hasRing = remaining !== null && clock !== null;
  const total = clock ? Math.max(1, clock.deadline - clock.startedAt) : 1;
  const left = hasRing ? Math.min(1, remaining / total) : 0;
  const isUrgent = hasRing && remaining <= URGENT_MS;
  const face = hasRing && showSeconds ? Math.ceil(remaining / MS_PER_SECOND) : initial;

  const classes = [
    'turn-avatar',
    `turn-avatar--${tone}`,
    isOnTurn ? 'turn-avatar--on-turn' : '',
    isAway ? 'turn-avatar--away' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classes}>
      {hasRing && (
        <svg
          className={`turn-avatar__ring${isUrgent ? ' turn-avatar__ring--urgent' : ''}`}
          viewBox="0 0 56 56"
          role="img"
          aria-label="Turn timer"
        >
          <circle className="turn-avatar__track" cx="28" cy="28" r={RING_RADIUS} />
          <circle
            className="turn-avatar__progress"
            cx="28"
            cy="28"
            r={RING_RADIUS}
            style={{ strokeDasharray: `${left * RING_LENGTH} ${RING_LENGTH}` }}
          />
        </svg>
      )}
      {/* The seconds change every tick, so they are kept from screen readers. */}
      <span className="turn-avatar__face" aria-hidden="true">
        {face}
      </span>
    </span>
  );
}
