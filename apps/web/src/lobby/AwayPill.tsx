import type { ReactElement } from 'react';
import { formatClock, useCountdown } from '../state/clock';

interface AwayPillProps {
  /** Server time the player's place is given up (epoch ms), if known. */
  holdDeadline: number | null;
  clockOffset: number;
}

/** Marks a player whose connection has dropped, counting down the time their place is held. */
export function AwayPill({ holdDeadline, clockOffset }: AwayPillProps): ReactElement {
  const left = useCountdown(holdDeadline, clockOffset);
  return (
    <span className="lobby__away">{left === null ? 'away' : `away ${formatClock(left)}`}</span>
  );
}
