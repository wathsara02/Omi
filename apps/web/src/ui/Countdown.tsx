import type { ReactElement } from 'react';
import { formatClock, useCountdown } from '../state/clock';
import './ui.css';

interface CountdownProps {
  /** Server time the countdown ends (epoch ms). */
  deadline: number;
  /** Server time the countdown was announced, which sets the full length of the bar. */
  startedAt: number;
  clockOffset: number;
  /** Spoken description, e.g. "Time left to play". */
  label: string;
  /** calm: nothing is at stake (the pause between rounds). */
  tone?: 'urgent' | 'calm';
}

const PERCENT = 100;

/** A bar that empties towards a server deadline, with the time left beside it. */
export function Countdown({
  deadline,
  startedAt,
  clockOffset,
  label,
  tone = 'urgent',
}: CountdownProps): ReactElement {
  const remaining = useCountdown(deadline, clockOffset) ?? 0;
  const total = Math.max(1, deadline - startedAt);
  const clock = formatClock(remaining);
  return (
    <div className={`countdown countdown--${tone}`}>
      <div className="countdown__track" aria-hidden="true">
        <div
          className="countdown__fill"
          style={{ width: `${Math.min(PERCENT, (remaining / total) * PERCENT)}%` }}
        />
      </div>
      <span className="countdown__clock" role="timer" aria-label={`${label}: ${clock}`}>
        {clock}
      </span>
    </div>
  );
}
