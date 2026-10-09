import type { GameSnapshot, RoomSnapshot } from '@omi/protocol';
import type { ReactElement } from 'react';
import { HomeScreen } from './home/HomeScreen';
import { LobbyScreen } from './lobby/LobbyScreen';
import type { Connection } from './net/connection';
import { loadName, loadSession } from './net/session';
import { ClosedNotice, ReconnectingNotice, ReplacedNotice } from './notices/Notices';
import { MatchEndScreen } from './results/MatchEndScreen';
import { RoundResultScreen } from './results/RoundResultScreen';
import { useRoundEnd } from './state/roundEnd';
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
  const { room, result } = state;

  // A match that has just ended stays on screen, though the room is a lobby again.
  if (result !== null && result.room.code === code) {
    return (
      <MatchView
        room={result.room}
        snapshot={result.game}
        clockOffset={state.clockOffset}
        game={game}
      />
    );
  }
  if (room === null || room.code !== code) {
    // A saved seat is either being reclaimed or about to be; a seat the server
    // has refused is forgotten, which is what lets the join form show.
    if (game.isResuming || loadSession(code) !== null) {
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
  return (
    <MatchView room={room} snapshot={state.game} clockOffset={state.clockOffset} game={game} />
  );
}

interface MatchViewProps {
  room: RoomSnapshot;
  snapshot: GameSnapshot;
  clockOffset: number;
  game: GameController;
}

/** The table, or what follows a round: its last trick, its result, then the match result. */
function MatchView({ room, snapshot, clockOffset, game }: MatchViewProps): ReactElement {
  const { stage, matchResult } = useRoundEnd(snapshot);
  const { phase } = snapshot.view;
  const isOver = phase === 'match-over';
  const leave = (): void => void game.leaveRoom();

  if (isOver && stage === null) {
    return (
      <MatchEndScreen room={room} game={snapshot} onLobby={game.backToLobby} onLeave={leave} />
    );
  }
  if ((isOver || phase === 'round-scored') && stage !== 'trick') {
    return (
      <RoundResultScreen
        room={room}
        game={snapshot}
        clockOffset={clockOffset}
        matchResult={isOver ? matchResult : null}
      />
    );
  }
  return (
    <TableScreen
      room={room}
      game={snapshot}
      clockOffset={clockOffset}
      onCallTrump={game.callTrump}
      onPlayCard={game.playCard}
      onLeave={leave}
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
