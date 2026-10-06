import type { Card, Suit } from '@omi/engine';
import type { Ack, ResumedSession, ServerToClientEvents, Session } from '@omi/protocol';
import { io } from 'socket.io-client';

type SocketListener = (...args: unknown[]) => void;

/** The part of the Socket.IO client this app uses, so tests can stand in for it. */
export interface SocketLike {
  readonly connected: boolean;
  on(event: string, listener: SocketListener): unknown;
  off(event: string, listener: SocketListener): unknown;
  timeout(ms: number): { emitWithAck(event: string, ...payload: unknown[]): Promise<unknown> };
  close(): unknown;
}

type ServerEvent = keyof ServerToClientEvents;

export interface Connection {
  createRoom(name: string): Promise<Ack<Session>>;
  joinRoom(code: string, name: string): Promise<Ack<Session>>;
  resume(code: string, token: string): Promise<Ack<ResumedSession>>;
  start(): Promise<Ack>;
  leave(): Promise<Ack>;
  kick(playerId: string): Promise<Ack>;
  callTrump(seq: number, suit: Suit): Promise<Ack>;
  playCard(seq: number, card: Card): Promise<Ack>;
  /** Subscribes to a server message; returns a function that unsubscribes. */
  on<E extends ServerEvent>(event: E, handler: ServerToClientEvents[E]): () => void;
  /** Calls back with the current status at once, then on every change. */
  onStatus(handler: (isOnline: boolean) => void): () => void;
  close(): void;
}

const REQUEST_TIMEOUT_MS = 5000;

const NO_ANSWER: Ack<never> = {
  ok: false,
  error: { code: 'internal', message: 'The server did not answer. Check your connection.' },
};

export const createConnection = (socket: SocketLike): Connection => {
  const request = async <T>(event: string, ...payload: unknown[]): Promise<Ack<T>> => {
    try {
      return (await socket.timeout(REQUEST_TIMEOUT_MS).emitWithAck(event, ...payload)) as Ack<T>;
    } catch {
      return NO_ANSWER;
    }
  };

  return {
    createRoom: (name) => request('room:create', { name }),
    joinRoom: (code, name) => request('room:join', { code, name }),
    resume: (code, token) => request('room:resume', { code, token }),
    start: () => request('room:start'),
    leave: () => request('room:leave'),
    kick: (playerId) => request('room:kick', { playerId }),
    callTrump: (seq, suit) => request('game:call-trump', { seq, suit }),
    playCard: (seq, card) => request('game:play-card', { seq, card }),
    on: (event, handler) => {
      const listener = handler as unknown as SocketListener;
      socket.on(event, listener);
      return () => {
        socket.off(event, listener);
      };
    },
    onStatus: (handler) => {
      const online = (): void => handler(true);
      const offline = (): void => handler(false);
      socket.on('connect', online);
      socket.on('disconnect', offline);
      handler(socket.connected);
      return () => {
        socket.off('connect', online);
        socket.off('disconnect', offline);
      };
    },
    close: () => {
      socket.close();
    },
  };
};

/** Opens the real socket. WebSocket only: the server checks the Origin header on it. */
export const openSocket = (serverUrl: string): SocketLike =>
  io(serverUrl, { transports: ['websocket'] }) as unknown as SocketLike;
