import { SEATS, type Seat } from '@omi/engine';
import type { ErrorCode, RoomSnapshot } from '@omi/protocol';
import type { Player, Room } from './types';

export const ROOM_SIZE = SEATS.length;

export type LobbyResult =
  { readonly ok: true; readonly room: Room } | { readonly ok: false; readonly code: ErrorCode };

export const createRoom = (code: string, host: Player): Room => ({
  code,
  hostId: host.id,
  status: 'lobby',
  players: [host],
  match: null,
  seq: 0,
  deadline: null,
});

export const addPlayer = (room: Room, player: Player): LobbyResult => {
  if (room.status !== 'lobby') return { ok: false, code: 'match-in-progress' };
  if (room.players.length >= ROOM_SIZE) return { ok: false, code: 'room-full' };
  return { ok: true, room: { ...room, players: [...room.players, player] } };
};

/** Returns null when the last player has gone and the room should be removed. */
export const removePlayer = (room: Room, playerId: string): Room | null => {
  const players = room.players.filter((player) => player.id !== playerId);
  const [longestWaiting] = players;
  if (longestWaiting === undefined) return null;

  const hostStays = players.some((player) => player.id === room.hostId);
  return { ...room, players, hostId: hostStays ? room.hostId : longestWaiting.id };
};

/** Why this player may not start the match, or null if they may. */
export const startProblem = (room: Room, playerId: string): ErrorCode | null => {
  if (room.status !== 'lobby') return 'match-in-progress';
  if (playerId !== room.hostId) return 'not-host';
  return room.players.length < ROOM_SIZE ? 'not-enough-players' : null;
};

/** Seats players by position: the first player takes `order[0]`, and so on. */
export const assignSeats = (room: Room, order: readonly Seat[]): Room => ({
  ...room,
  players: room.players.map((player, index) => ({ ...player, seat: order[index] ?? null })),
});

export const updatePlayer = (
  room: Room,
  playerId: string,
  changes: Partial<Pick<Player, 'socketId' | 'isBot'>>,
): Room => ({
  ...room,
  players: room.players.map((player) =>
    player.id === playerId ? { ...player, ...changes } : player,
  ),
});

export const findPlayer = (room: Room, playerId: string): Player | undefined =>
  room.players.find((player) => player.id === playerId);

export const findPlayerBySocket = (room: Room, socketId: string): Player | undefined =>
  room.players.find((player) => player.socketId === socketId);

export const findPlayerBySeat = (room: Room, seat: Seat): Player | undefined =>
  room.players.find((player) => player.seat === seat);

export const hasConnectedHuman = (room: Room): boolean =>
  room.players.some((player) => player.socketId !== null);

/** The room as one player may see it. Built field by field, never by spreading. */
export const toRoomSnapshot = (room: Room, youId: string): RoomSnapshot => ({
  code: room.code,
  status: room.status,
  youId,
  players: room.players.map((player) => ({
    id: player.id,
    name: player.name,
    isHost: player.id === room.hostId,
    isConnected: player.socketId !== null,
    isBot: player.isBot,
    seat: player.seat,
  })),
});
