import type { Ack, RoomClosedReason } from '@omi/protocol';
import { useId, useState, type ReactElement, type ReactNode } from 'react';
import { formatClock, useNow } from '../state/clock';
import '../ui/ui.css';
import './notices.css';

const MS_PER_SECOND = 1000;
const PERCENT = 100;

interface DialogProps {
  title: string;
  children: ReactNode;
  /** alertdialog interrupts and needs an answer; status only informs. */
  role: 'alertdialog' | 'status';
}

function Dialog({ title, children, role }: DialogProps): ReactElement {
  const titleId = useId();
  return (
    <div className="notice">
      <div
        className="dialog"
        role={role}
        aria-modal={role === 'alertdialog' ? true : undefined}
        aria-labelledby={titleId}
      >
        <h1 id={titleId} className="dialog__title">
          {title}
        </h1>
        {children}
      </div>
    </div>
  );
}

interface ReconnectingNoticeProps {
  /** When the connection dropped, by this device's clock. */
  offlineSince: number;
  holdSeconds: number;
}

/** Shown over the table while the connection is down and the seat is being held. */
export function ReconnectingNotice({
  offlineSince,
  holdSeconds,
}: ReconnectingNoticeProps): ReactElement {
  const now = useNow(true);
  const holdMs = holdSeconds * MS_PER_SECOND;
  const remaining = Math.max(0, offlineSince + holdMs - now);
  const isHeld = remaining > 0;
  return (
    <Dialog title="Reconnecting" role="status">
      <div className="dialog__spinner" aria-hidden="true" />
      <p className="dialog__body">
        {isHeld
          ? 'Your seat is being held. If you are not back in time, a bot plays for you until you return.'
          : 'A bot is playing your seat. You take it back as soon as you reconnect.'}
      </p>
      {isHeld && (
        <div className="dialog__hold">
          <div className="dialog__hold-row">
            <span>Seat held for</span>
            <span className="dialog__hold-clock">{formatClock(remaining)}</span>
          </div>
          <div className="countdown__track" aria-hidden="true">
            <div
              className="countdown__fill"
              style={{ width: `${(remaining / holdMs) * PERCENT}%` }}
            />
          </div>
        </div>
      )}
    </Dialog>
  );
}

interface ReplacedNoticeProps {
  onPlayHere: () => Promise<Ack<unknown>>;
}

/** Another tab or device resumed this seat. */
export function ReplacedNotice({ onPlayHere }: ReplacedNoticeProps): ReactElement {
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const playHere = async (): Promise<void> => {
    setIsBusy(true);
    const ack = await onPlayHere();
    setIsBusy(false);
    setError(ack.ok ? null : ack.error.message);
  };

  return (
    <Dialog title="Playing in another tab" role="alertdialog">
      <p className="dialog__body">
        Your seat moved to the tab or device you opened last. You can carry on there, or bring the
        seat back here.
      </p>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        className="button button--primary"
        autoFocus
        disabled={isBusy}
        onClick={() => void playHere()}
      >
        Play here instead
      </button>
    </Dialog>
  );
}

interface ClosedNoticeProps {
  reason: RoomClosedReason;
  onHome: () => void;
}

const CLOSED_TEXT: Readonly<Record<RoomClosedReason, { title: string; body: string }>> = {
  kicked: {
    title: 'The host removed you',
    body: 'You are no longer in that room. You can create your own room or join another.',
  },
  expired: {
    title: 'This room has closed',
    body: 'Rooms close after 10 minutes with nothing happening. Start a new one whenever you are ready.',
  },
};

/** The player is out of the room for good: removed by the host, or the room expired. */
export function ClosedNotice({ reason, onHome }: ClosedNoticeProps): ReactElement {
  const text = CLOSED_TEXT[reason];
  return (
    <Dialog title={text.title} role="alertdialog">
      <p className="dialog__body">{text.body}</p>
      <button type="button" className="button button--primary" autoFocus onClick={onHome}>
        Back to home
      </button>
    </Dialog>
  );
}
