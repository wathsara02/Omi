import type { Ack, RoomPlayer, RoomSnapshot } from '@omi/protocol';
import { useEffect, useState, type ReactElement } from 'react';
import { roomPath } from '../state/route';
import { Avatar } from '../ui/Avatar';
import '../ui/ui.css';
import { AwayPill } from './AwayPill';
import './lobby.css';

interface LobbyScreenProps {
  room: RoomSnapshot;
  /** Server clock minus this device's clock, for the countdown on an away player. */
  clockOffset?: number;
  onStart: () => Promise<Ack>;
  onKick: (playerId: string) => Promise<Ack>;
  onLeave: () => void;
}

const ROOM_SIZE = 4;
const COPIED_NOTE_MS = 2000;

const seatsLeftText = (count: number): string =>
  count === 1 ? 'Waiting for one more player' : `Waiting for ${count} more players`;

export function LobbyScreen({
  room,
  clockOffset = 0,
  onStart,
  onKick,
  onLeave,
}: LobbyScreenProps): ReactElement {
  const [hasCopied, setHasCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const me = room.players.find((player) => player.id === room.youId);
  const isHost = me?.isHost ?? false;
  const seatsLeft = ROOM_SIZE - room.players.length;
  const isFull = seatsLeft <= 0;
  // A match cannot start with a seat nobody is sitting in; the server refuses too.
  const away = room.players.find((player) => !player.isConnected);
  const canStart = isFull && away === undefined;

  useEffect(() => {
    if (!hasCopied) return undefined;
    const timer = setTimeout(() => setHasCopied(false), COPIED_NOTE_MS);
    return () => clearTimeout(timer);
  }, [hasCopied]);

  const copyLink = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(window.location.origin + roomPath(room.code));
      setHasCopied(true);
    } catch {
      setError('Could not copy. Share the code instead.');
    }
  };

  const report = async (request: Promise<Ack>): Promise<void> => {
    setError(null);
    const ack = await request;
    if (!ack.ok) setError(ack.error.message);
  };

  const start = async (): Promise<void> => {
    setIsStarting(true);
    await report(onStart());
    setIsStarting(false);
  };

  const describe = (player: RoomPlayer): string | null => {
    if (player.id === room.youId) return player.isHost ? 'You · host' : 'You';
    return player.isHost ? 'Host' : null;
  };

  let guestStatus = 'The host starts when four players are in';
  if (away) guestStatus = `Waiting for ${away.name} to reconnect`;
  else if (isFull) guestStatus = 'Waiting for the host to start';

  return (
    <div className="screen screen--wide lobby">
      <header className="lobby__header">
        <span className="eyebrow">Room code</span>
        <div className="lobby__code-row">
          <span className="lobby__code" aria-label={`Room code ${room.code.split('').join(' ')}`}>
            {room.code}
          </span>
          <button type="button" className="button button--accent" onClick={() => void copyLink()}>
            {hasCopied ? 'Copied' : 'Copy link'}
          </button>
        </div>
        <p className="lobby__hint">Share this code. The match needs four players.</p>
      </header>

      <main className="sheet lobby__sheet">
        <div className="lobby__heading">
          <h1 className="lobby__title">Players</h1>
          <span className="muted lobby__count">
            {room.players.length} of {ROOM_SIZE}
          </span>
        </div>

        <ul className="lobby__players">
          {room.players.map((player) => {
            const detail = describe(player);
            return (
              <li
                key={player.id}
                className={`lobby__player${player.isConnected ? '' : ' lobby__player--away'}`}
              >
                <Avatar name={player.name} tone={player.id === room.youId ? 'solid' : 'outlined'} />
                <div className="lobby__player-text">
                  <span className="lobby__player-name">{player.name}</span>
                  {detail && <span className="lobby__player-detail">{detail}</span>}
                  {!player.isConnected && (
                    <AwayPill holdDeadline={player.holdDeadline} clockOffset={clockOffset} />
                  )}
                </div>
                {isHost && player.id !== room.youId && (
                  <button
                    type="button"
                    className="button button--danger"
                    aria-label={`Remove ${player.name}`}
                    onClick={() => void report(onKick(player.id))}
                  >
                    Remove
                  </button>
                )}
              </li>
            );
          })}
          {!isFull && (
            <li className="lobby__player lobby__player--empty">
              <span className="lobby__empty-seat" aria-hidden="true" />
              <span className="muted">{seatsLeftText(seatsLeft)}</span>
            </li>
          )}
        </ul>

        <p className="lobby__note">
          Teams and seats are drawn at random when the match starts. The room closes after 10
          minutes with no changes.
        </p>

        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}

        <div className="lobby__actions">
          {isHost ? (
            <>
              <button
                type="button"
                className="button button--primary"
                disabled={!canStart || isStarting}
                onClick={() => void start()}
              >
                {isStarting ? 'Starting…' : 'Start match'}
              </button>
              {!isFull && <span className="lobby__needs">Needs 4 players</span>}
              {isFull && away && (
                <span className="lobby__needs" role="status">
                  {away.name} is away. Wait, or remove them.
                </span>
              )}
            </>
          ) : (
            <p className="lobby__needs" role="status">
              {guestStatus}
            </p>
          )}
          <button type="button" className="button button--quiet" onClick={onLeave}>
            Leave room
          </button>
        </div>
      </main>
    </div>
  );
}
