import { isCard, type Card } from '@omi/engine';
import type { Ack, GameSnapshot, RoomSnapshot, Session } from '@omi/protocol';
import pino from 'pino';
import { GameService, type GameServiceOptions, type Timings } from '../src/gameService';
import { InMemoryRoomStore } from '../src/roomStore';

export const TEST_TIMINGS: Timings = {
  turnMs: 15_000,
  holdMs: 60_000,
  roundPauseMs: 5_000,
  botDelayMs: 1_000,
  idleRoomMs: 600_000,
};

export const SOCKETS = ['s0', 's1', 's2', 's3'] as const;

export interface Sent {
  readonly socketId: string;
  readonly event: string;
  readonly payload: unknown;
}

export const silentLogger = pino({ level: 'silent' });

export const createHarness = (options: Partial<GameServiceOptions> = {}) => {
  const sent: Sent[] = [];
  const store = new InMemoryRoomStore();
  const service = new GameService({
    store,
    emit: (socketId, event, payload) => {
      sent.push({ socketId, event, payload });
    },
    logger: silentLogger,
    timings: TEST_TIMINGS,
    ...options,
  });

  const last = <T>(socketId: string, event: string): T => {
    const found = sent.filter((each) => each.socketId === socketId && each.event === event).at(-1);
    if (!found) throw new Error(`Nothing sent to ${socketId} on ${event}`);
    return found.payload as T;
  };

  return {
    service,
    store,
    sent,
    game: (socketId: string) => last<GameSnapshot>(socketId, 'game:state'),
    room: (socketId: string) => last<RoomSnapshot>(socketId, 'room:state'),
  };
};

export type Harness = ReturnType<typeof createHarness>;

export const mustOk = <T>(ack: Ack<T>): T => {
  if (!ack.ok) throw new Error(`${ack.error.code}: ${ack.error.message}`);
  return ack.data;
};

export const errorOf = (ack: Ack<unknown>): string | null => (ack.ok ? null : ack.error.code);

export interface Table {
  readonly code: string;
  /** One session per socket in SOCKETS order; s0 is the host. */
  readonly sessions: readonly Session[];
}

/** Fills a room with four players without starting the match. */
export const fillRoom = (harness: Harness): Table => {
  const host = mustOk(harness.service.createRoom('s0', { name: 'P0' }));
  const others = SOCKETS.slice(1).map((socketId, index) =>
    mustOk(harness.service.joinRoom(socketId, { code: host.code, name: `P${index + 1}` })),
  );
  return { code: host.code, sessions: [host, ...others] };
};

/** Fills a room and has the host start the match. */
export const startMatch = (harness: Harness): Table => {
  const table = fillRoom(harness);
  mustOk(harness.service.start('s0'));
  return table;
};

/** The socket whose seat must act next, judged from what each socket was last sent. */
export const socketOnTurn = (harness: Harness, sockets: readonly string[] = SOCKETS): string => {
  const found = sockets.find((socketId) => {
    const { view } = harness.game(socketId);
    return view.turn === view.seat;
  });
  if (!found) throw new Error('No listed socket is on turn');
  return found;
};

/** Has the seat on turn call hearts or play its first legal card. */
export const actOnTurn = (harness: Harness, sockets: readonly string[] = SOCKETS): Ack => {
  const socketId = socketOnTurn(harness, sockets);
  const { view, seq } = harness.game(socketId);
  if (view.phase === 'calling-trump') {
    return harness.service.callTrump(socketId, { seq, suit: 'hearts' });
  }
  return harness.service.playCard(socketId, { seq, card: view.legalMoves[0] as Card });
};

/** Plays by hand until the current round is scored. */
export const playRound = (harness: Harness): void => {
  const startedIn = harness.game('s0').view.roundNumber;
  for (;;) {
    const { view } = harness.game('s0');
    if (view.roundNumber !== startedIn || view.turn === null) return;
    mustOk(actOnTurn(harness));
  }
};

const childrenOf = (value: unknown): readonly unknown[] => {
  if (Array.isArray(value)) return value;
  return typeof value === 'object' && value !== null ? Object.values(value) : [];
};

export const collectCards = (value: unknown): Card[] =>
  isCard(value) ? [value] : childrenOf(value).flatMap(collectCards);

export const collectKeys = (value: unknown): string[] => {
  const ownKeys =
    typeof value === 'object' && value !== null && !Array.isArray(value) ? Object.keys(value) : [];
  return [...ownKeys, ...childrenOf(value).flatMap(collectKeys)];
};
