import type { ReactElement } from 'react';
import { HomeScreen } from './home/HomeScreen';
import { LobbyScreen } from './lobby/LobbyScreen';
import type { Connection } from './net/connection';
import { loadName, loadSession } from './net/session';
import { ClosedNotice, ReconnectingNotice, ReplacedNotice } from './notices/Notices';
import { MatchEndScreen } from './results/MatchEndScreen';
import { RoundResultScreen } from './results/RoundResultScreen';
import type { GameController } from './state/useGame';
import { useGame } from './state/useGame';
import { TableScreen } from './table/TableScreen';
import './ui/ui.css';

interface AppProps {
  connection: Connection;
}

interface WaitingProps {
  message: string;
}

function Waiting({ message }: WaitingProps): ReactElement {
  return (
    <div className="screen waiting" role="status">
      <p className="waiting__message">{message}</p>
    </div>
  );
}

/** The screen for the room in the address bar, chosen from what the server last sent. */
function RoomView({ game, code }: { game: GameController; code: string }): ReactElement {
  const { state } = game;
  const { room } = state;

  if (room === null || room.code !== code) {
    const hasSavedSeat = loadSession(code) !== null;
    if (game.isResuming || (hasSavedSeat && !state.isOnline)) {
      return <Waiting message="Taking your seat…" />;
    }
    return (
      <HomeScreen
        initialName={loadName()}
        linkedCode={code}
        onCreate={game.createRoom}
        onJoin={game.joinRoom}
      />
    );
  }
  if (room.status === 'lobby') {
    return (
      <LobbyScreen
        room={room}
        onStart={game.startMatch}
        onKick={game.kick}
        onLeave={() => void game.leaveRoom()}
      />
    );
  }
  if (state.game === null) return <Waiting message="Dealing…" />;

  const { phase } = state.game.view;
  if (phase === 'match-over') {
    return <MatchEndScreen room={room} game={state.game} onHome={() => void game.leaveRoom()} />;
  }
  if (phase === 'round-scored') {
    return <RoundResultScreen room={room} game={state.game} clockOffset={state.clockOffset} />;
  }
  return (
    <TableScreen
      room={room}
      game={state.game}
      clockOffset={state.clockOffset}
      onCallTrump={game.callTrump}
      onPlayCard={game.playCard}
      onLeave={() => void game.leaveRoom()}
    />
  );
}

export function App({ connection }: AppProps): ReactElement {
  const game = useGame(connection);
  const { state, route } = game;

  if (state.closed === 'kicked' || state.closed === 'expired') {
    return <ClosedNotice reason={state.closed} onHome={game.goHome} />;
  }

  const isSeated = state.room !== null && state.room.status !== 'lobby';
  const holdSeconds = state.game?.view.config.reconnectHoldSeconds;
  return (
    <>
      {route.name === 'home' ? (
        <HomeScreen initialName={loadName()} onCreate={game.createRoom} onJoin={game.joinRoom} />
      ) : (
        <RoomView game={game} code={route.code} />
      )}
      {state.closed === 'replaced' && <ReplacedNotice onPlayHere={game.playHere} />}
      {state.closed === null &&
        isSeated &&
        state.offlineSince !== null &&
        holdSeconds !== undefined && (
          <ReconnectingNotice offlineSince={state.offlineSince} holdSeconds={holdSeconds} />
        )}
    </>
  );
}
