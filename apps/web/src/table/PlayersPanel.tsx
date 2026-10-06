import type { PlayerView, Seat } from '@omi/engine';
import type { RoomPlayer, RoomSnapshot } from '@omi/protocol';
import type { ReactElement } from 'react';
import { formatClock, useCountdown } from '../state/clock';
import { playerAtSeat, seatLayout } from '../state/selectors';

interface PlayersPanelProps {
  room: RoomSnapshot;
  view: PlayerView;
  clockOffset: number;
}

interface PlayerRowProps {
  player: RoomPlayer | undefined;
  isMe: boolean;
  isPartner: boolean;
  isDealer: boolean;
  isOnTurn: boolean;
  clockOffset: number;
}

function PlayerRow({
  player,
  isMe,
  isPartner,
  isDealer,
  isOnTurn,
  clockOffset,
}: PlayerRowProps): ReactElement {
  const holdLeft = useCountdown(player?.holdDeadline ?? null, clockOffset);
  const name = player?.name ?? 'Player';
  const isAway = player !== undefined && !player.isConnected && !player.isBot;

  let note = [isPartner ? 'partner' : null, isDealer ? 'dealer' : null].filter(Boolean).join(' · ');
  if (isOnTurn) note = 'to play';
  if (player?.isBot) note = 'bot';
  if (isAway) note = holdLeft === null ? 'away' : `away · bot in ${formatClock(holdLeft)}`;

  const tone = isAway ? 'away' : isOnTurn ? 'on-turn' : 'plain';
  return (
    <li className={`players__row players__row--${tone}`}>
      <span className="players__name">{isMe ? `${name} (you)` : name}</span>
      {note && <span className="players__note">{note}</span>}
    </li>
  );
}

/** The four players with what each is doing. Shown in the desktop side panel. */
export function PlayersPanel({ room, view, clockOffset }: PlayersPanelProps): ReactElement {
  const layout = seatLayout(view);
  const seats: readonly Seat[] = [layout.me, layout.partner, layout.left, layout.right];
  return (
    <section className="players" aria-labelledby="players-heading">
      <h2 id="players-heading" className="eyebrow">
        Players
      </h2>
      <ul className="players__list">
        {seats.map((seat) => (
          <PlayerRow
            key={seat}
            player={playerAtSeat(room, seat)}
            isMe={seat === layout.me}
            isPartner={seat === layout.partner}
            isDealer={view.dealer === seat}
            isOnTurn={view.turn === seat}
            clockOffset={clockOffset}
          />
        ))}
      </ul>
    </section>
  );
}
