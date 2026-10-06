import type { Card, Suit } from '@omi/engine';
import type { Ack, Session } from '@omi/protocol';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { Connection } from '../net/connection';
import { clearSession, loadSession, saveName, saveSession } from '../net/session';
import { INITIAL_STATE, reduce, type AppState } from './gameStore';
import { HOME_PATH, roomPath, useRoute, type Route } from './route';

export interface GameController {
  readonly state: AppState;
  readonly route: Route;
  /** True while a stored seat for this room link is being reclaimed. */
  readonly isResuming: boolean;
  createRoom(name: string): Promise<Ack<unknown>>;
  joinRoom(code: string, name: string): Promise<Ack<unknown>>;
  startMatch(): Promise<Ack>;
  kick(playerId: string): Promise<Ack>;
  leaveRoom(): Promise<void>;
  callTrump(suit: Suit): Promise<Ack>;
  playCard(card: Card): Promise<Ack>;
  /** Brings the seat back to this tab after another tab took it. */
  playHere(): Promise<Ack<unknown>>;
  goHome(): void;
}

const NOT_IN_A_MATCH: Ack<never> = {
  ok: false,
  error: { code: 'no-match', message: 'There is no match in progress.' },
};

const NO_SAVED_SEAT: Ack<never> = {
  ok: false,
  error: { code: 'session-invalid', message: 'That seat could not be restored.' },
};

/** Connects the socket to the store and exposes what the screens can do. */
export const useGame = (connection: Connection): GameController => {
  const [state, dispatch] = useReducer(reduce, INITIAL_STATE);
  const [route, navigate] = useRoute();
  const [isResuming, setIsResuming] = useState(false);
  // Counts connections, so a seat is reclaimed once per connection and no more.
  const [connectionCount, setConnectionCount] = useState(0);
  const seatedOnConnection = useRef<{ code: string; connection: number } | null>(null);
  const pendingResumes = useRef(0);
  const roomCode = route.name === 'room' ? route.code : null;

  useEffect(() => {
    const stops = [
      connection.onStatus((isOnline) => {
        if (!isOnline) {
          dispatch({ type: 'offline', at: Date.now() });
          return;
        }
        dispatch({ type: 'online' });
        setConnectionCount((count) => count + 1);
      }),
      connection.on('room:state', (snapshot) => {
        dispatch({ type: 'room', snapshot, receivedAt: Date.now() });
      }),
      connection.on('game:state', (snapshot) => {
        dispatch({ type: 'game', snapshot, receivedAt: Date.now() });
      }),
      connection.on('session:replaced', () => dispatch({ type: 'replaced' })),
      connection.on('room:closed', (reason) => dispatch({ type: 'closed', reason })),
    ];
    return () => stops.forEach((stop) => stop());
  }, [connection]);

  // A removed or expired room's token is useless; forget it.
  const closedRoomCode = state.closed !== null && state.closed !== 'replaced' ? roomCode : null;
  useEffect(() => {
    if (closedRoomCode !== null) clearSession(closedRoomCode);
  }, [closedRoomCode]);

  // On every new connection, reclaim the seat for the room in the address bar.
  useEffect(() => {
    if (!state.isOnline || roomCode === null) return;
    const seated = seatedOnConnection.current;
    if (seated?.code === roomCode && seated.connection === connectionCount) return;
    const session = loadSession(roomCode);
    if (!session) return;

    seatedOnConnection.current = { code: roomCode, connection: connectionCount };
    pendingResumes.current += 1;
    setIsResuming(true);
    void connection.resume(roomCode, session.token).then((ack) => {
      if (!ack.ok && ack.error.code !== 'already-in-room') clearSession(roomCode);
      pendingResumes.current -= 1;
      setIsResuming(pendingResumes.current > 0);
    });
  }, [connection, connectionCount, roomCode, state.isOnline]);

  const enter = useCallback(
    (ack: Ack<Session>, name: string): Ack<Session> => {
      if (!ack.ok) return ack;
      const { code, playerId, token } = ack.data;
      saveSession(code, { playerId, token });
      saveName(name);
      seatedOnConnection.current = { code, connection: connectionCount };
      navigate(roomPath(code));
      return ack;
    },
    [connectionCount, navigate],
  );

  const seq = state.game?.seq;

  return useMemo<GameController>(
    () => ({
      state,
      route,
      isResuming,
      createRoom: async (name) => enter(await connection.createRoom(name), name),
      joinRoom: async (code, name) => enter(await connection.joinRoom(code, name), name),
      startMatch: () => connection.start(),
      kick: (playerId) => connection.kick(playerId),
      leaveRoom: async () => {
        await connection.leave();
        if (roomCode !== null) clearSession(roomCode);
        dispatch({ type: 'reset' });
        navigate(HOME_PATH);
      },
      callTrump: (suit) =>
        seq === undefined ? Promise.resolve(NOT_IN_A_MATCH) : connection.callTrump(seq, suit),
      playCard: (card) =>
        seq === undefined ? Promise.resolve(NOT_IN_A_MATCH) : connection.playCard(seq, card),
      playHere: () => {
        const session = roomCode === null ? null : loadSession(roomCode);
        if (roomCode === null || !session) return Promise.resolve(NO_SAVED_SEAT);
        return connection.resume(roomCode, session.token);
      },
      goHome: () => {
        dispatch({ type: 'reset' });
        navigate(HOME_PATH);
      },
    }),
    [connection, enter, isResuming, navigate, roomCode, route, seq, state],
  );
};
