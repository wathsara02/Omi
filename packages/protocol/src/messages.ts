import type { EngineErrorCode, GameEvent, PlayerView, Seat } from '@omi/engine';
import type {
  CallTrumpPayload,
  CreateRoomPayload,
  JoinRoomPayload,
  KickPayload,
  PlayCardPayload,
  ResumePayload,
} from './schemas';

export type ErrorCode =
  | EngineErrorCode
  | 'invalid-payload'
  | 'rate-limited'
  | 'room-not-found'
  | 'room-full'
  | 'server-full'
  | 'match-in-progress'
  | 'already-in-room'
  | 'not-in-room'
  | 'not-host'
  | 'not-enough-players'
  | 'player-not-found'
  | 'cannot-kick-self'
  | 'no-match'
  | 'stale-action'
  | 'session-invalid'
  | 'internal';

export interface AckError {
  readonly code: ErrorCode;
  readonly message: string;
}

/** Every client request is answered with one of these. */
export type Ack<T = null> =
  { readonly ok: true; readonly data: T } | { readonly ok: false; readonly error: AckError };

export type AckCallback<T = null> = (response: Ack<T>) => void;

export type RoomStatus = 'lobby' | 'playing' | 'finished';

/** Removed by the host, or the room sat idle too long. */
export type RoomClosedReason = 'kicked' | 'expired';

export interface RoomPlayer {
  /** Public id; safe to show to everyone in the room. */
  readonly id: string;
  readonly name: string;
  readonly isHost: boolean;
  readonly isConnected: boolean;
  readonly isBot: boolean;
  /** null until the host starts the match and seats are drawn. */
  readonly seat: Seat | null;
  /** When a bot will take this disconnected player’s seat (epoch ms), or null. */
  readonly holdDeadline: number | null;
}

export interface RoomSnapshot {
  readonly code: string;
  readonly status: RoomStatus;
  /** The id of the player this snapshot was sent to. */
  readonly youId: string;
  readonly players: readonly RoomPlayer[];
  /** The server’s clock when this was sent (epoch ms). Deadlines are in this clock. */
  readonly serverNow: number;
}

export interface GameSnapshot {
  /** This player's own view; never another player's. */
  readonly view: PlayerView;
  /** Send this back with the next action. */
  readonly seq: number;
  /**
   * When the server will next act by itself (epoch ms): play for the seat on
   * turn, or deal the next round. null when nothing is pending or a bot is on turn.
   */
  readonly deadline: number | null;
  /** The server’s clock when this was sent (epoch ms). Deadlines are in this clock. */
  readonly serverNow: number;
  /** What just happened, for animation. Public information only. */
  readonly events: readonly GameEvent[];
}

/** Returned once, on create or join. The token is the player's proof of seat. */
export interface Session {
  readonly code: string;
  readonly playerId: string;
  readonly token: string;
}

export type ResumedSession = Omit<Session, 'token'>;

export interface ClientToServerEvents {
  'room:create': (payload: CreateRoomPayload, ack: AckCallback<Session>) => void;
  'room:join': (payload: JoinRoomPayload, ack: AckCallback<Session>) => void;
  'room:resume': (payload: ResumePayload, ack: AckCallback<ResumedSession>) => void;
  'room:start': (ack: AckCallback) => void;
  'room:leave': (ack: AckCallback) => void;
  /** Host only, and only before the match starts. */
  'room:kick': (payload: KickPayload, ack: AckCallback) => void;
  'game:call-trump': (payload: CallTrumpPayload, ack: AckCallback) => void;
  'game:play-card': (payload: PlayCardPayload, ack: AckCallback) => void;
}

export interface ServerToClientEvents {
  'room:state': (snapshot: RoomSnapshot) => void;
  'game:state': (snapshot: GameSnapshot) => void;
  /** This socket no longer holds its seat: the same player resumed from another one. */
  'session:replaced': (reason: 'resumed-elsewhere') => void;
  /** This socket is no longer in its room. */
  'room:closed': (reason: RoomClosedReason) => void;
}
