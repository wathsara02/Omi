import { otherTeam, seatOrderFrom, type PlayerView, type Seat, type Team } from '@omi/engine';
import type { RoomPlayer, RoomSnapshot } from '@omi/protocol';

export const findMe = (room: RoomSnapshot): RoomPlayer | undefined =>
  room.players.find((player) => player.id === room.youId);

export const playerAtSeat = (room: RoomSnapshot, seat: Seat): RoomPlayer | undefined =>
  room.players.find((player) => player.seat === seat);

/** Where the other three seats sit on this player's screen. */
export interface SeatLayout {
  readonly me: Seat;
  readonly right: Seat;
  readonly partner: Seat;
  readonly left: Seat;
}

/**
 * The player is always at the bottom with their partner opposite. Play runs
 * counter-clockwise by default, which on screen is: me, right, partner, left.
 */
export const seatLayout = (view: PlayerView): SeatLayout => {
  const [me, next, partner, last] = seatOrderFrom(view.seat, view.config.turnOrder);
  const isCounterClockwise = view.config.turnOrder === 'counter-clockwise';
  return {
    me,
    partner,
    right: isCounterClockwise ? next : last,
    left: isCounterClockwise ? last : next,
  };
};

export interface Score {
  readonly us: number;
  readonly them: number;
  readonly target: number;
}

export const tokenScore = (view: PlayerView): Score => ({
  us: view.tokens[view.team],
  them: view.tokens[otherTeam(view.team)],
  target: view.config.tokenTarget,
});

export const trickScore = (view: PlayerView): Omit<Score, 'target'> => ({
  us: view.tricksWon[view.team],
  them: view.tricksWon[otherTeam(view.team)],
});

export const isMyTeam = (view: PlayerView, team: Team): boolean => team === view.team;

/** The name to show for a seat: "You" for the player's own. */
export const seatName = (room: RoomSnapshot, view: PlayerView, seat: Seat): string =>
  seat === view.seat ? 'You' : (playerAtSeat(room, seat)?.name ?? 'Player');
