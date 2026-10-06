import type { GameSnapshot, RoomClosedReason, RoomSnapshot } from '@omi/protocol';

/** Why this tab is no longer in its room: removed, expired, or taken over by another tab. */
export type ClosedReason = RoomClosedReason | 'replaced';

export interface AppState {
  readonly isOnline: boolean;
  /** When the connection dropped, by this device's clock; null while online. */
  readonly offlineSince: number | null;
  readonly room: RoomSnapshot | null;
  readonly game: GameSnapshot | null;
  /** Server clock minus this device's clock, in ms. Deadlines are in server time. */
  readonly clockOffset: number;
  readonly closed: ClosedReason | null;
}

export type AppAction =
  | { readonly type: 'online' }
  | { readonly type: 'offline'; readonly at: number }
  | { readonly type: 'room'; readonly snapshot: RoomSnapshot; readonly receivedAt: number }
  | { readonly type: 'game'; readonly snapshot: GameSnapshot; readonly receivedAt: number }
  | { readonly type: 'replaced' }
  | { readonly type: 'closed'; readonly reason: RoomClosedReason }
  | { readonly type: 'reset' };

export const INITIAL_STATE: AppState = {
  isOnline: false,
  offlineSince: null,
  room: null,
  game: null,
  clockOffset: 0,
  closed: null,
};

/** Everything the screens show is derived from what the server last sent. */
export const reduce = (state: AppState, action: AppAction): AppState => {
  switch (action.type) {
    case 'online':
      return { ...state, isOnline: true, offlineSince: null };
    case 'offline':
      return { ...state, isOnline: false, offlineSince: state.offlineSince ?? action.at };
    case 'room':
      return {
        ...state,
        room: action.snapshot,
        // A lobby has no match, so a game state from an earlier match must not linger.
        game: action.snapshot.status === 'lobby' ? null : state.game,
        clockOffset: action.snapshot.serverNow - action.receivedAt,
        // Hearing from the room again means this tab holds the seat once more.
        closed: null,
      };
    case 'game':
      return {
        ...state,
        game: action.snapshot,
        clockOffset: action.snapshot.serverNow - action.receivedAt,
      };
    case 'replaced':
      return { ...state, closed: 'replaced' };
    case 'closed':
      return { ...state, room: null, game: null, closed: action.reason };
    case 'reset':
      return { ...state, room: null, game: null, closed: null };
  }
};
