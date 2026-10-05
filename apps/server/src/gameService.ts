import {
  DEFAULT_RULES,
  SEATS,
  applyAction,
  applyAutoAction,
  createMatch,
  viewFor,
  type Action,
  type Applied,
  type ApplyResult,
  type GameEvent,
  type RulesConfig,
  type Seat,
} from '@omi/engine';
import type {
  Ack,
  CallTrumpPayload,
  CreateRoomPayload,
  JoinRoomPayload,
  KickPayload,
  PlayCardPayload,
  ResumedSession,
  RoomClosedReason,
  ResumePayload,
  ServerToClientEvents,
  Session,
} from '@omi/protocol';
import type { Logger } from 'pino';
import { OK, fail, failFromEngine, succeed } from './acks';
import {
  hashToken,
  logRef,
  newPlayerId,
  newRoomCode,
  newSeed,
  newSessionToken,
  shuffled,
  tokenMatches,
} from './ids';
import {
  addPlayer,
  assignSeats,
  createRoom,
  findPlayer,
  findPlayerBySeat,
  hasConnectedHuman,
  removePlayer,
  startProblem,
  toRoomSnapshot,
  updatePlayer,
} from './room/lobby';
import type { Player, Room } from './room/types';
import type { RoomStore } from './roomStore';

export interface Timings {
  /** How long a seat has to act before it is played for. */
  readonly turnMs: number;
  /** How long a disconnected player's seat is held before a bot takes over. */
  readonly holdMs: number;
  /** Pause between a scored round and the next deal. */
  readonly roundPauseMs: number;
  /** How long a bot waits before acting. */
  readonly botDelayMs: number;
  /** How long a lobby may sit unchanged, or a finished room stay open, before it is removed. */
  readonly idleRoomMs: number;
}

const MS_PER_SECOND = 1000;
const IDLE_ROOM_MINUTES = 10;
const SECONDS_PER_MINUTE = 60;

export const DEFAULT_TIMINGS: Timings = {
  turnMs: DEFAULT_RULES.turnTimerSeconds * MS_PER_SECOND,
  holdMs: DEFAULT_RULES.reconnectHoldSeconds * MS_PER_SECOND,
  roundPauseMs: 5 * MS_PER_SECOND,
  botDelayMs: 1 * MS_PER_SECOND,
  idleRoomMs: IDLE_ROOM_MINUTES * SECONDS_PER_MINUTE * MS_PER_SECOND,
};

const DEFAULT_MAX_ROOMS = 1000;

/** Sends one event to one socket. Game data only ever leaves through this. */
export type Emit = <E extends keyof ServerToClientEvents>(
  socketId: string,
  event: E,
  payload: Parameters<ServerToClientEvents[E]>[0],
) => void;

export interface GameServiceOptions {
  readonly store: RoomStore;
  readonly emit: Emit;
  readonly logger: Logger;
  readonly timings?: Timings;
  readonly maxRooms?: number;
  readonly rules?: RulesConfig;
}

interface Binding {
  readonly code: string;
  readonly playerId: string;
}

interface Seated {
  readonly room: Room;
  readonly player: Player;
}

interface RoomTimers {
  /** The one pending step: a turn timeout, a bot's move or the next deal. */
  step: NodeJS.Timeout | null;
  /** Removes a lobby or finished room that has sat idle too long. */
  idle: NodeJS.Timeout | null;
  /** Disconnect holds, by player id. */
  readonly holds: Map<string, NodeJS.Timeout>;
}

type Step = 'auto-action' | 'next-round';

/**
 * Rooms, matches, timers and presence, with no knowledge of the transport.
 * Every method is synchronous, so Node runs them one at a time and no two
 * actions on a room can interleave.
 */
export class GameService {
  private readonly store: RoomStore;
  private readonly emit: Emit;
  private readonly logger: Logger;
  private readonly timings: Timings;
  private readonly maxRooms: number;
  private readonly rules: RulesConfig;
  private readonly bindings = new Map<string, Binding>();
  private readonly timers = new Map<string, RoomTimers>();

  constructor(options: GameServiceOptions) {
    this.store = options.store;
    this.emit = options.emit;
    this.logger = options.logger;
    this.timings = options.timings ?? DEFAULT_TIMINGS;
    this.maxRooms = options.maxRooms ?? DEFAULT_MAX_ROOMS;
    this.rules = options.rules ?? DEFAULT_RULES;
  }

  createRoom(socketId: string, payload: CreateRoomPayload): Ack<Session> {
    if (this.bindings.has(socketId)) return fail('already-in-room');
    if (this.store.count() >= this.maxRooms) return fail('server-full');

    const token = newSessionToken();
    const host = this.newPlayer(socketId, payload.name, token);
    const room = createRoom(this.unusedCode(), host);
    this.store.save(room);
    this.bindings.set(socketId, { code: room.code, playerId: host.id });
    this.armIdle(room.code);
    this.logger.info({ room: logRef(room.code), player: host.id }, 'room created');
    this.sendRoom(room);
    return succeed({ code: room.code, playerId: host.id, token });
  }

  joinRoom(socketId: string, payload: JoinRoomPayload): Ack<Session> {
    if (this.bindings.has(socketId)) return fail('already-in-room');
    const existing = this.store.find(payload.code);
    if (!existing) return fail('room-not-found');

    const token = newSessionToken();
    const player = this.newPlayer(socketId, payload.name, token);
    const added = addPlayer(existing, player);
    if (!added.ok) return fail(added.code);

    this.store.save(added.room);
    this.bindings.set(socketId, { code: added.room.code, playerId: player.id });
    this.armIdle(added.room.code);
    this.logger.info({ room: logRef(added.room.code), player: player.id }, 'player joined');
    this.sendRoom(added.room);
    return succeed({ code: added.room.code, playerId: player.id, token });
  }

  /** Reclaims a seat with its session token, from a bot or from an older socket. */
  resume(socketId: string, payload: ResumePayload): Ack<ResumedSession> {
    if (this.bindings.has(socketId)) return fail('already-in-room');
    const existing = this.store.find(payload.code);
    const player = existing?.players.find((each) => tokenMatches(payload.token, each.tokenHash));
    // One answer for a wrong token and an unknown room, so codes cannot be probed.
    if (!existing || !player) return fail('session-invalid');

    if (player.socketId !== null) {
      // The seat moves to the new socket; tell the old one so its screen does not go stale.
      this.bindings.delete(player.socketId);
      this.emit(player.socketId, 'session:replaced', 'resumed-elsewhere');
    }
    this.clearHold(existing.code, player.id);
    this.bindings.set(socketId, { code: existing.code, playerId: player.id });
    const room = updatePlayer(existing, player.id, { socketId, isBot: false });
    this.logger.info({ room: logRef(room.code), player: player.id }, 'player resumed');

    const wasBotOnTurn = player.isBot && room.match?.turn === player.seat;
    const current = wasBotOnTurn ? this.schedule(room) : room;
    this.store.save(current);
    this.sendRoom(current);
    if (wasBotOnTurn) this.sendGame(current, []);
    else this.sendGameTo(current, { ...player, socketId }, []);
    return succeed({ code: current.code, playerId: player.id });
  }

  start(socketId: string): Ack {
    const seated = this.seatedAt(socketId);
    if (!seated) return fail('not-in-room');
    const problem = startProblem(seated.room, seated.player.id);
    if (problem) return fail(problem);

    const match = createMatch(this.rules, newSeed());
    if (!match.ok) {
      this.logger.error(
        { room: logRef(seated.room.code), code: match.error.code },
        'match not created',
      );
      return fail('internal');
    }
    // Team selection is random: seats are drawn, not taken in joining order.
    const seatedRoom = assignSeats(seated.room, shuffled(SEATS));
    const room = this.schedule({ ...seatedRoom, status: 'playing', match: match.value, seq: 0 });
    this.store.save(room);
    this.clearIdle(room.code);
    this.logger.info({ room: logRef(room.code) }, 'match started');
    this.sendRoom(room);
    this.sendGame(room, []);
    return OK;
  }

  callTrump(socketId: string, payload: CallTrumpPayload): Ack {
    return this.act(socketId, payload.seq, (seat) => ({
      type: 'call-trump',
      seat,
      suit: payload.suit,
    }));
  }

  playCard(socketId: string, payload: PlayCardPayload): Ack {
    return this.act(socketId, payload.seq, (seat) => ({
      type: 'play-card',
      seat,
      card: payload.card,
    }));
  }

  /** The host removes a player from the lobby. Not possible once the match has started. */
  kick(socketId: string, payload: KickPayload): Ack {
    const seated = this.seatedAt(socketId);
    if (!seated) return fail('not-in-room');
    const { room, player: host } = seated;
    if (room.status !== 'lobby') return fail('match-in-progress');
    if (host.id !== room.hostId) return fail('not-host');
    if (payload.playerId === host.id) return fail('cannot-kick-self');
    const target = findPlayer(room, payload.playerId);
    const remaining = target && removePlayer(room, target.id);
    if (!target || !remaining) return fail('player-not-found');

    this.store.save(remaining);
    this.armIdle(room.code);
    this.logger.info({ room: logRef(room.code), player: target.id }, 'player kicked');
    this.release(target, 'kicked');
    this.sendRoom(remaining);
    return OK;
  }

  leave(socketId: string): Ack {
    if (!this.bindings.has(socketId)) return fail('not-in-room');
    this.disconnect(socketId);
    return OK;
  }

  /** Called when a socket goes away for any reason. */
  disconnect(socketId: string): void {
    const seated = this.seatedAt(socketId);
    this.bindings.delete(socketId);
    if (!seated) return;
    const { room, player } = seated;

    // Before the match a player simply leaves; once seats are drawn the seat is kept.
    const remaining =
      room.status === 'lobby'
        ? removePlayer(room, player.id)
        : updatePlayer(room, player.id, { socketId: null });
    if (remaining === null || !hasConnectedHuman(remaining)) {
      this.removeRoom(room.code);
      return;
    }
    this.store.save(remaining);
    this.logger.info({ room: logRef(room.code), player: player.id }, 'player disconnected');
    if (remaining.status === 'playing') this.startHold(room.code, player.id);
    if (remaining.status === 'lobby') this.armIdle(room.code);
    this.sendRoom(remaining);
  }

  /** Cancels every timer. Call before shutting the process down. */
  close(): void {
    for (const code of [...this.timers.keys()]) this.clearTimers(code);
  }

  // --- actions

  private act(socketId: string, seq: number, actionFor: (seat: Seat) => Action): Ack {
    const seated = this.seatedAt(socketId);
    if (!seated) return fail('not-in-room');
    const { room, player } = seated;
    if (room.status !== 'playing' || room.match === null || player.seat === null) {
      return fail('no-match');
    }
    // The seat always comes from the session, never from the client.
    if (seq !== room.seq) return fail('stale-action');

    const result = applyAction(room.match, actionFor(player.seat));
    if (!result.ok) return failFromEngine(result.error);
    this.commit(room, result.value);
    return OK;
  }

  private commit(room: Room, applied: Applied): void {
    const finished = applied.state.phase === 'match-over';
    const next = this.schedule({
      ...room,
      match: applied.state,
      seq: room.seq + 1,
      status: finished ? 'finished' : 'playing',
    });
    this.store.save(next);
    if (finished) {
      this.clearHolds(room.code);
      this.armIdle(room.code);
      this.logger.info({ room: logRef(room.code), winner: applied.state.winner }, 'match finished');
      this.sendRoom(next);
    }
    this.sendGame(next, applied.events);
  }

  // --- timers

  /** Arms the one timer the room's current state calls for and sets the deadline. */
  private schedule(room: Room): Room {
    this.clearStep(room.code);
    const { match } = room;
    if (match === null || match.phase === 'match-over') return { ...room, deadline: null };

    if (match.phase === 'round-scored') {
      this.armStep(room, 'next-round', this.timings.roundPauseMs);
      return { ...room, deadline: null };
    }
    const onTurn = match.turn === null ? undefined : findPlayerBySeat(room, match.turn);
    if (onTurn?.isBot) {
      this.armStep(room, 'auto-action', this.timings.botDelayMs);
      return { ...room, deadline: null };
    }
    this.armStep(room, 'auto-action', this.timings.turnMs);
    return { ...room, deadline: Date.now() + this.timings.turnMs };
  }

  private armStep(room: Room, step: Step, delayMs: number): void {
    const { code, seq } = room;
    this.timersFor(code).step = setTimeout(() => this.runStep(code, seq, step), delayMs);
  }

  private runStep(code: string, expectedSeq: number, step: Step): void {
    const room = this.store.find(code);
    // A timer that outlived its turn must do nothing.
    if (!room || room.match === null || room.seq !== expectedSeq) return;
    try {
      const result: ApplyResult =
        step === 'next-round'
          ? applyAction(room.match, { type: 'next-round', seed: newSeed() })
          : applyAutoAction(room.match);
      if (result.ok) {
        this.commit(room, result.value);
        return;
      }
      this.logger.error({ room: logRef(code), step, reason: result.error.code }, 'step rejected');
    } catch (error: unknown) {
      this.logger.error({ room: logRef(code), step, err: error }, 'step failed');
    }
    this.retryStep(code, expectedSeq);
  }

  /** A failed step must not leave a live match with no timer; arm it again. */
  private retryStep(code: string, expectedSeq: number): void {
    const room = this.store.find(code);
    if (room && room.seq === expectedSeq) this.store.save(this.schedule(room));
  }

  private startHold(code: string, playerId: string): void {
    this.clearHold(code, playerId);
    const hold = setTimeout(() => this.onHoldExpired(code, playerId), this.timings.holdMs);
    this.timersFor(code).holds.set(playerId, hold);
  }

  private onHoldExpired(code: string, playerId: string): void {
    this.timers.get(code)?.holds.delete(playerId);
    // Runs from a timer: an error here must not take the whole process down.
    try {
      this.handOverToBot(code, playerId);
    } catch (error: unknown) {
      this.logger.error({ room: logRef(code), err: error }, 'bot takeover failed');
    }
  }

  private handOverToBot(code: string, playerId: string): void {
    const existing = this.store.find(code);
    const player = existing && findPlayer(existing, playerId);
    if (!existing || !player || player.socketId !== null) return;

    const asBot = updatePlayer(existing, playerId, { isBot: true });
    const isBotsTurn = asBot.status === 'playing' && asBot.match?.turn === player.seat;
    // If the bot inherits a turn in progress it acts after the bot delay.
    const room = isBotsTurn ? this.schedule(asBot) : asBot;
    this.store.save(room);
    this.logger.info({ room: logRef(code), player: playerId }, 'bot took over');
    this.sendRoom(room);
    if (isBotsTurn) this.sendGame(room, []);
  }

  /** Starts, or restarts, the countdown after which an idle room is removed. */
  private armIdle(code: string): void {
    this.clearIdle(code);
    const timers = this.timersFor(code);
    timers.idle = setTimeout(() => this.onIdleExpired(code), this.timings.idleRoomMs);
  }

  private clearIdle(code: string): void {
    const timers = this.timers.get(code);
    if (!timers || timers.idle === null) return;
    clearTimeout(timers.idle);
    timers.idle = null;
  }

  private onIdleExpired(code: string): void {
    // Runs from a timer: an error here must not take the whole process down.
    try {
      const room = this.store.find(code);
      if (!room || room.status === 'playing') return;
      for (const player of room.players) this.release(player, 'expired');
      this.removeRoom(code);
    } catch (error: unknown) {
      this.logger.error({ room: logRef(code), err: error }, 'room expiry failed');
    }
  }

  private timersFor(code: string): RoomTimers {
    const existing = this.timers.get(code);
    if (existing) return existing;
    const created: RoomTimers = { step: null, idle: null, holds: new Map() };
    this.timers.set(code, created);
    return created;
  }

  private clearStep(code: string): void {
    const timers = this.timers.get(code);
    if (!timers || timers.step === null) return;
    clearTimeout(timers.step);
    timers.step = null;
  }

  private clearHold(code: string, playerId: string): void {
    const holds = this.timers.get(code)?.holds;
    clearTimeout(holds?.get(playerId));
    holds?.delete(playerId);
  }

  private clearHolds(code: string): void {
    const holds = this.timers.get(code)?.holds;
    for (const hold of holds?.values() ?? []) clearTimeout(hold);
    holds?.clear();
  }

  private clearTimers(code: string): void {
    this.clearStep(code);
    this.clearIdle(code);
    this.clearHolds(code);
    this.timers.delete(code);
  }

  // --- rooms and players

  /** Unbinds a player’s socket, if they have one, and tells it why. */
  private release(player: Player, reason: RoomClosedReason): void {
    if (player.socketId === null) return;
    this.bindings.delete(player.socketId);
    this.emit(player.socketId, 'room:closed', reason);
  }

  private removeRoom(code: string): void {
    this.clearTimers(code);
    this.store.remove(code);
    this.logger.info({ room: logRef(code) }, 'room removed');
  }

  private newPlayer(socketId: string, name: string, token: string): Player {
    return {
      id: newPlayerId(),
      name,
      tokenHash: hashToken(token),
      socketId,
      isBot: false,
      seat: null,
    };
  }

  private unusedCode(): string {
    for (;;) {
      const code = newRoomCode();
      if (!this.store.find(code)) return code;
    }
  }

  private seatedAt(socketId: string): Seated | null {
    const binding = this.bindings.get(socketId);
    const room = binding && this.store.find(binding.code);
    const player = room && findPlayer(room, binding.playerId);
    return room && player ? { room, player } : null;
  }

  // --- sending

  private sendRoom(room: Room): void {
    for (const player of room.players) {
      if (player.socketId === null) continue;
      this.emit(player.socketId, 'room:state', toRoomSnapshot(room, player.id));
    }
  }

  private sendGame(room: Room, events: readonly GameEvent[]): void {
    for (const player of room.players) this.sendGameTo(room, player, events);
  }

  /** Each socket gets its own seat's view and nothing else; there is no broadcast. */
  private sendGameTo(room: Room, player: Player, events: readonly GameEvent[]): void {
    if (room.match === null || player.socketId === null || player.seat === null) return;
    this.emit(player.socketId, 'game:state', {
      view: viewFor(room.match, player.seat),
      seq: room.seq,
      deadline: room.deadline,
      events,
    });
  }
}
