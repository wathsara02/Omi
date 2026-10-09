import {
  DEFAULT_RULES,
  applyAction,
  applyAutoAction,
  createMatch,
  seedFromInteger,
  viewFor,
  type Action,
  type GameEvent,
  type GameState,
  type RulesConfig,
  type Seat,
} from '@omi/engine';
import type { GameSnapshot, RoomPlayer, RoomSnapshot } from '@omi/protocol';

export const SERVER_NOW = 1_700_000_000_000;

const NAMES = ['Ruwan', 'Kamala', 'Nimal', 'Sunil'] as const;

/** Four players seated 0 to 3; `you` is seat 0 (Ruwan) and the host unless overridden. */
export const roomSnapshot = (overrides: Partial<RoomSnapshot> = {}): RoomSnapshot => ({
  code: 'KXT4P9',
  status: 'playing',
  youId: 'p0',
  players: NAMES.map((name, seat): RoomPlayer => ({
    id: `p${seat}`,
    name,
    isHost: seat === 0,
    isConnected: true,
    isBot: false,
    isReady: false,
    seat: seat as Seat,
    holdDeadline: null,
  })),
  serverNow: SERVER_NOW,
  ...overrides,
});

export const lobbySnapshot = (playerCount: number, youId = 'p0'): RoomSnapshot =>
  roomSnapshot({
    status: 'lobby',
    youId,
    players: roomSnapshot()
      .players.slice(0, playerCount)
      .map((player) => ({ ...player, seat: null })),
  });

export const withPlayer = (
  room: RoomSnapshot,
  playerId: string,
  changes: Partial<RoomPlayer>,
): RoomSnapshot => ({
  ...room,
  players: room.players.map((player) =>
    player.id === playerId ? { ...player, ...changes } : player,
  ),
});

const must = <T>(result: { ok: true; value: T } | { ok: false; error: { message: string } }): T => {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};

export const newMatch = (seed = 1, rules: RulesConfig = DEFAULT_RULES): GameState =>
  must(createMatch(rules, seedFromInteger(seed)));

export interface Stepped {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

export const apply = (state: GameState, action: Action): Stepped =>
  must(applyAction(state, action));

export const auto = (state: GameState): Stepped => must(applyAutoAction(state));

/** Plays automatically until `isDone` says stop; returns the last step taken. */
export const autoUntil = (start: GameState, isDone: (state: GameState) => boolean): Stepped => {
  let step: Stepped = { state: start, events: [] };
  while (!isDone(step.state)) {
    step =
      step.state.phase === 'round-scored'
        ? apply(step.state, { type: 'next-round', seed: seedFromInteger(step.state.roundNumber) })
        : auto(step.state);
  }
  return step;
};

export const snapshotFor = (
  state: GameState,
  seat: Seat,
  overrides: Partial<GameSnapshot> = {},
): GameSnapshot => ({
  view: viewFor(state, seat),
  seq: 0,
  deadline: SERVER_NOW + 9000,
  events: [],
  serverNow: SERVER_NOW,
  ...overrides,
});

/** A match waiting for trump, seen by the trump caller. */
export const trumpCallSnapshot = (): GameSnapshot => {
  const state = newMatch();
  return snapshotFor(state, state.caller);
};

/** Mid-trick with trump called, seen by the seat that must play next. */
export const playingSnapshot = (cardsPlayed = 1): GameSnapshot => {
  let step = auto(newMatch());
  for (let played = 0; played < cardsPlayed; played += 1) step = auto(step.state);
  return snapshotFor(step.state, step.state.turn as Seat, { seq: cardsPlayed + 1 });
};
