import type { Card, Suit } from '@omi/engine';
import type { Ack, RoomSnapshot, Session } from '@omi/protocol';
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
  /** After a match: puts the result away and shows the lobby the room has become. */
  backToLobby(): void;
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

/** How long to wait before trying again after a resume that got no usable answer. */
const RESUME_RETRY_MS = 3000;

/** One attempt to reclaim a seat: which room, on which connection, which try. */
const attemptKey = (code: string, connection: number, retry: number): string =>
  `${code}:${connection}:${retry}`;

/** Connects the socket to the store and exposes what the screens can do. */
export const useGame = (connection: Connection): GameController => {
  const [state, dispatch] = useReducer(reduce, INITIAL_STATE);
  const [route, navigate] = useRoute();
  // Counts connections, so a seat is reclaimed once per connection and no more.
  const [connectionCount, setConnectionCount] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const [resumingKey, setResumingKey] = useState<string | null>(null);
  const latestConnection = useRef(0);
  const attempted = useRef<string | null>(null);
  const roomRef = useRef<RoomSnapshot | null>(null);
  const roomCode = route.name === 'room' ? route.code : null;

  useEffect(() => {
    roomRef.current = state.room;
  }, [state.room]);

  useEffect(() => {
    const stops = [
      connection.onStatus((isOnline) => {
        if (!isOnline) {
          dispatch({ type: 'offline', at: Date.now() });
          return;
        }
        latestConnection.current += 1;
        setConnectionCount(latestConnection.current);
        dispatch({ type: 'online' });
      }),
      connection.on('room:state', (snapshot) => {
        dispatch({ type: 'room', snapshot, receivedAt: Date.now() });
      }),
      connection.on('game:state', (snapshot) => {
        dispatch({ type: 'game', snapshot, receivedAt: Date.now() });
      }),
      connection.on('session:replaced', () => dispatch({ type: 'replaced' })),
      connection.on('room:closed', (reason) => {
        // The token of a room the player was removed from, or that expired, is useless.
        if (roomRef.current !== null) clearSession(roomRef.current.code);
        dispatch({ type: 'closed', reason });
      }),
    ];
    return () => stops.forEach((stop) => stop());
  }, [connection]);

  // The Back button, or a pasted link, moved away from the room this tab is in:
  // give that seat up, so the tab is free for wherever it went.
  useEffect(() => {
    const room = roomRef.current;
    if (room === null || room.code === roomCode) return;
    void connection.leave().then(() => dispatch({ type: 'reset' }));
  }, [connection, roomCode]);

  // On every new connection, reclaim the seat for the room in the address bar.
  const hasOtherRoom = state.room !== null && state.room.code !== roomCode;
  const isReplaced = state.closed === 'replaced';
  useEffect(() => {
    // A tab whose seat was taken elsewhere waits to be asked before taking it back.
    if (!state.isOnline || roomCode === null || hasOtherRoom || isReplaced) return undefined;
    const key = attemptKey(roomCode, connectionCount, retryCount);
    if (attempted.current === key) return undefined;
    const session = loadSession(roomCode);
    if (!session) return undefined;

    attempted.current = key;
    setResumingKey(key);
    let retry: ReturnType<typeof setTimeout> | undefined;
    void connection.resume(roomCode, session.token).then((ack) => {
      // An answer for an older connection says nothing about this one.
      if (latestConnection.current !== connectionCount) return;
      if (ack.ok || ack.error.code === 'already-in-room') {
        setResumingKey(null);
      } else if (ack.error.code === 'session-invalid') {
        // The server no longer knows this seat: forget it and the table it showed.
        clearSession(roomCode);
        dispatch({ type: 'reset' });
        setResumingKey(null);
      } else {
        // No answer, or a busy server: the seat may still be there. Keep the token and try again.
        retry = setTimeout(() => setRetryCount((count) => count + 1), RESUME_RETRY_MS);
      }
    });
    return () => clearTimeout(retry);
  }, [connection, connectionCount, hasOtherRoom, isReplaced, retryCount, roomCode, state.isOnline]);

  const enter = useCallback(
    (ack: Ack<Session>, name: string): Ack<Session> => {
      if (!ack.ok) return ack;
      const { code, playerId, token } = ack.data;
      saveSession(code, { playerId, token });
      saveName(name);
      // Already seated on this connection: nothing to reclaim.
      attempted.current = attemptKey(code, latestConnection.current, retryCount);
      navigate(roomPath(code));
      return ack;
    },
    [navigate, retryCount],
  );

  const seq = state.game?.seq;
  const isResuming =
    resumingKey !== null &&
    roomCode !== null &&
    resumingKey === attemptKey(roomCode, connectionCount, retryCount);

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
        const ack = await connection.leave();
        // With no answer the server may still hold the seat, so the token is kept.
        const hasLeft = ack.ok || ack.error.code === 'not-in-room';
        if (hasLeft && roomCode !== null) clearSession(roomCode);
        dispatch({ type: 'reset' });
        navigate(HOME_PATH);
      },
      backToLobby: () => dispatch({ type: 'dismiss-result' }),
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
