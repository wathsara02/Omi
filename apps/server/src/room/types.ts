import type { GameState, Seat } from '@omi/engine';
import type { RoomStatus } from '@omi/protocol';

export interface Player {
  /** Public id, shown to everyone in the room. */
  readonly id: string;
  readonly name: string;
  /** SHA-256 of the session token. The token itself is never stored. */
  readonly tokenHash: Buffer;
  /** The socket currently bound to this player, or null while disconnected. */
  readonly socketId: string | null;
  /** True once the disconnect hold has expired and a bot is playing the seat. */
  readonly isBot: boolean;
  /** null until the host starts the match and seats are drawn. */
  readonly seat: Seat | null;
}

/**
 * Server-side room record. It holds token hashes and the full match state, so
 * it is never sent to a client; use toRoomSnapshot and the engine's viewFor.
 */
export interface Room {
  readonly code: string;
  readonly hostId: string;
  readonly status: RoomStatus;
  /** In joining order, so the first player is the one who has waited longest. */
  readonly players: readonly Player[];
  readonly match: GameState | null;
  /** Goes up by one with every applied action; clients echo it back. */
  readonly seq: number;
  /** When the seat on turn will be played for automatically (epoch ms), or null. */
  readonly deadline: number | null;
}
