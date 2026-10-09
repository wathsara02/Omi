import type { PlayerView, Seat, Trick } from '@omi/engine';
import type { RoomSnapshot } from '@omi/protocol';
import type { ReactElement } from 'react';
import { PlayingCard } from '../cards/PlayingCard';
import { playerAtSeat, seatLayout, seatName, trickScore } from '../state/selectors';
import { SeatBadge } from './SeatBadge';
import type { TurnClock } from './TurnAvatar';

interface TrickAreaProps {
  room: RoomSnapshot;
  view: PlayerView;
  clockOffset: number;
  /** The trick to show: the one in progress, or the one just won. */
  trick: Trick | null;
  /** Set while a finished trick is being shown, to ring the winning card. */
  winner: Seat | null;
  /** The countdown for the seat on turn, or null when there is none to show. */
  turnClock: TurnClock | null;
}

type Position = 'top' | 'left' | 'right' | 'bottom';

/** A slight tilt per position, so cards look laid down by hand. */
const TILT: Readonly<Record<Position, number>> = { top: -3, left: 4, right: -5, bottom: 0 };

/** The middle of the table: the three other players and the cards played to the trick. */
export function TrickArea({
  room,
  view,
  clockOffset,
  trick,
  winner,
  turnClock,
}: TrickAreaProps): ReactElement {
  const layout = seatLayout(view);
  const tricks = trickScore(view);
  const isWaitingForMe = view.phase === 'playing' && view.turn === view.seat && winner === null;

  const cardAt = (position: Position, seat: Seat): ReactElement | null => {
    const play = trick?.plays.find((each) => each.seat === seat);
    if (!play) {
      return position === 'bottom' && isWaitingForMe ? (
        <div className="trick__slot">Your card</div>
      ) : null;
    }
    const who = seat === view.seat ? 'you' : seatName(room, view, seat);
    return (
      <PlayingCard
        card={play.card}
        state={winner === seat ? 'winner' : 'idle'}
        tilt={TILT[position]}
        note={`${trick?.leader === seat ? 'led' : 'played'} by ${who}`}
      />
    );
  };

  const badge = (seat: Seat, isPartner: boolean): ReactElement => (
    <SeatBadge
      player={playerAtSeat(room, seat)}
      cardCount={view.handCounts[seat]}
      clockOffset={clockOffset}
      isPartner={isPartner}
      isDealer={view.dealer === seat}
      isOnTurn={view.turn === seat && winner === null}
      turnClock={turnClock}
      layout={isPartner ? 'row' : 'stack'}
    />
  );

  return (
    <div className="trick">
      <div className="trick__seat trick__seat--top">{badge(layout.partner, true)}</div>
      <div className="trick__card trick__card--top">{cardAt('top', layout.partner)}</div>

      <div className="trick__side trick__side--left">
        {cardAt('left', layout.left)}
        {badge(layout.left, false)}
      </div>
      <div className="trick__count">
        <span className="eyebrow">Tricks</span>
        <span className="trick__count-value" aria-hidden="true">
          {tricks.us} – {tricks.them}
        </span>
        <span className="visually-hidden">
          Us {tricks.us}, them {tricks.them}
        </span>
      </div>
      <div className="trick__side trick__side--right">
        {cardAt('right', layout.right)}
        {badge(layout.right, false)}
      </div>

      <div className="trick__card trick__card--bottom">{cardAt('bottom', layout.me)}</div>
    </div>
  );
}
