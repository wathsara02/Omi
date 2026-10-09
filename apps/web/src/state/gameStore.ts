import type { GameSnapshot, RoomClosedReason, RoomSnapshot } from '@omi/protocol';

/** Why this tab is no longer in its room: removed, expired, or taken over by another tab. */
export type ClosedReason = RoomClosedReason | 'replaced';

/**
 * A match that has ended, with the room as it was played. The server turns the
 * room back into a lobby at once, so the seats and names are kept here for the
 * result screens.
 */
export interface MatchResult {
  readonly room: RoomSnapshot;
  readonly game: GameSnapshot;
}

export interface AppState {
  readonly isOnline: boolean;
  /** When the connection dropped, by this device's clock; null while online. */
  readonly offlineSince: number | null;
  readonly room: RoomSnapshot | null;
  readonly game: GameSnapshot | null;
  /** The match that just ended, until the player returns to the lobby or a new one starts. */
  readonly result: MatchResult | null;
  /** Server clock minus this device's clock, in ms. Deadlines are in server time. */
  readonly clockOffset: number;
  readonly closed: ClosedReason | null;
}

export type AppAction =
  | { readonly type: 'online' }
  | { readonly type: 'offline'; readonly at: number }
  | { readonly type: 'room'; readonly snapshot: RoomSnapshot; readonly receivedAt: number }
  | { readonly type: 'game'; readonly snapshot: GameSnapshot; readonly receivedAt: number }
  | { readonly type: 'dismiss-result' }
  | { readonly type: 'replaced' }
  | { readonly type: 'closed'; readonly reason: RoomClosedReason }
  | { readonly type: 'reset' };

export const INITIAL_STATE: AppState = {
  isOnline: false,
  offlineSince: null,
  room: null,
  game: null,
  result: null,
  clockOffset: 0,
  closed: null,
};

/** Everything the screens show is derived from what the server last sent. */
export const reduce = (state: AppState, action: AppAction): AppState => {
  switch (action.type) {
    case 'online':
      // Being connected is not yet being seated: while a room is on screen, the
      // reconnect notice stays until that room is heard from again.
      return {
        ...state,
        isOnline: true,
        offlineSince: state.room === null ? null : state.offlineSince,
      };
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
        offlineSince: null,
      };
    case 'game': {
      const isOver = action.snapshot.view.phase === 'match-over';
      return {
        ...state,
        game: action.snapshot,
        // Any other state means a match is being played, so an old result is done with.
        result: isOver && state.room ? { room: state.room, game: action.snapshot } : null,
        clockOffset: action.snapshot.serverNow - action.receivedAt,
      };
    }
    case 'dismiss-result':
      return { ...state, result: null };
    case 'replaced':
      return { ...state, closed: 'replaced' };
    case 'closed':
      return {
        ...state,
        room: null,
        game: null,
        result: null,
        closed: action.reason,
        offlineSince: null,
      };
    case 'reset':
      return { ...state, room: null, game: null, result: null, closed: null, offlineSince: null };
  }
};
