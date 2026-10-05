import type { AddressInfo } from 'node:net';
import { DEFAULT_RULES, type RulesConfig } from '@omi/engine';
import type { Ack, GameSnapshot, RoomSnapshot, Session } from '@omi/protocol';
import { io, type Socket } from 'socket.io-client';
import { createOmiServer, type OmiServer, type OmiServerOptions } from '../src/socketServer';
import { silentLogger } from './harness';

/** Short real-time timings, so socket tests do not need fake timers. */
export const FAST_TIMINGS = {
  turnMs: 5000,
  holdMs: 250,
  roundPauseMs: 30,
  botDelayMs: 20,
  idleRoomMs: 60_000,
};

const WAIT_LIMIT_MS = 5000;

export const ALLOWED_ORIGIN = 'http://localhost:5173';

export interface Frame {
  readonly event: string;
  readonly payload: unknown;
}

export interface Client {
  readonly socket: Socket;
  /** Every message this client has received, in order. */
  readonly frames: Frame[];
  request<T = null>(event: string, ...payload: unknown[]): Promise<Ack<T>>;
  game(): GameSnapshot;
  room(): RoomSnapshot;
  waitFor<T>(event: string, matches: (payload: T) => boolean): Promise<T>;
  close(): void;
}

export interface ConnectOptions {
  /** The Origin header to send; null sends none. Defaults to the allowed origin. */
  readonly origin?: string | null;
  /** An X-Forwarded-For header, as a reverse proxy would add. */
  readonly forwardedFor?: string;
}

/** Generous, so only the tests about rate limiting ever meet a limit. */
const TEST_LIMITS = {
  perSocket: { capacity: 10_000, refillPerSecond: 0 },
  perAddress: { capacity: 10_000, refillPerSecond: 0 },
  resume: { capacity: 10_000, refillPerSecond: 0 },
};

export interface Running {
  readonly server: OmiServer;
  readonly url: string;
  connect(options?: ConnectOptions): Promise<Client>;
  stop(): Promise<void>;
}

export const startServer = async (
  overrides: Partial<OmiServerOptions> & { rules?: RulesConfig } = {},
): Promise<Running> => {
  const server = createOmiServer({
    corsOrigins: [ALLOWED_ORIGIN],
    logger: silentLogger,
    timings: FAST_TIMINGS,
    rules: DEFAULT_RULES,
    limits: TEST_LIMITS,
    ...overrides,
  });
  await new Promise<void>((resolve) => server.httpServer.listen(0, '127.0.0.1', resolve));
  const { port } = server.httpServer.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}`;
  const clients: Client[] = [];

  const connect = async (options: ConnectOptions = {}): Promise<Client> => {
    const client = await openClient(url, options);
    clients.push(client);
    return client;
  };
  const stop = async (): Promise<void> => {
    for (const client of clients) client.close();
    await server.close();
  };
  return { server, url, connect, stop };
};

const openClient = async (url: string, options: ConnectOptions): Promise<Client> => {
  const origin = options.origin === undefined ? ALLOWED_ORIGIN : options.origin;
  const socket = io(url, {
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
    extraHeaders: {
      ...(origin !== null && { Origin: origin }),
      ...(options.forwardedFor !== undefined && { 'X-Forwarded-For': options.forwardedFor }),
    },
  });
  const frames: Frame[] = [];
  const waiters = new Set<() => void>();
  socket.onAny((event: string, payload: unknown) => {
    frames.push({ event, payload });
    for (const check of [...waiters]) check();
  });
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', (error) => {
      socket.close();
      reject(error);
    });
  });

  const last = <T>(event: string): T => {
    const frame = frames.filter((each) => each.event === event).at(-1);
    if (!frame) throw new Error(`No ${event} received yet`);
    return frame.payload as T;
  };

  const waitFor = <T>(event: string, matches: (payload: T) => boolean): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const find = (): T | undefined =>
        frames
          .filter((each) => each.event === event)
          .map((each) => each.payload as T)
          .find(matches);
      const check = (): void => {
        const found = find();
        if (found === undefined) return;
        clearTimeout(limit);
        waiters.delete(check);
        resolve(found);
      };
      const limit = setTimeout(() => {
        waiters.delete(check);
        reject(new Error(`Timed out waiting for ${event}`));
      }, WAIT_LIMIT_MS);
      waiters.add(check);
      check();
    });

  return {
    socket,
    frames,
    request: <T>(event: string, ...payload: unknown[]) =>
      socket.timeout(WAIT_LIMIT_MS).emitWithAck(event, ...payload) as Promise<Ack<T>>,
    game: () => last<GameSnapshot>('game:state'),
    room: () => last<RoomSnapshot>('room:state'),
    waitFor,
    close: () => {
      socket.close();
    },
  };
};

export const must = <T>(ack: Ack<T>): T => {
  if (!ack.ok) throw new Error(`${ack.error.code}: ${ack.error.message}`);
  return ack.data;
};

export interface LiveTable {
  readonly clients: readonly Client[];
  readonly sessions: readonly Session[];
  readonly code: string;
}

/** Four connected clients in one room, with the match started by the host. */
export const openTable = async (running: Running): Promise<LiveTable> => {
  const clients = await Promise.all([0, 1, 2, 3].map(() => running.connect()));
  const [host, ...others] = clients as [Client, Client, Client, Client];
  const hostSession = must(await host.request<Session>('room:create', { name: 'P0' }));
  const sessions = [hostSession];
  for (const [index, client] of others.entries()) {
    const joined = await client.request<Session>('room:join', {
      code: hostSession.code,
      name: `P${index + 1}`,
    });
    sessions.push(must(joined));
  }
  must(await host.request('room:start'));
  await Promise.all(clients.map((client) => client.waitFor('game:state', () => true)));
  return { clients, sessions, code: hostSession.code };
};

/** Waits until every listed client has been sent the given sequence number. */
export const allAt = (clients: readonly Client[], seq: number): Promise<unknown> =>
  Promise.all(
    clients.map((client) =>
      client.waitFor<GameSnapshot>('game:state', (snapshot) => snapshot.seq >= seq),
    ),
  );

/** Has whichever listed client is on turn act, then waits for everyone to hear of it. */
export const actOnce = async (clients: readonly Client[]): Promise<Ack> => {
  const acting = clients.find((client) => {
    const { view } = client.game();
    return view.turn === view.seat;
  });
  if (!acting) throw new Error('No listed client is on turn');
  const { view, seq } = acting.game();
  const ack =
    view.phase === 'calling-trump'
      ? await acting.request('game:call-trump', { seq, suit: 'hearts' })
      : await acting.request('game:play-card', { seq, card: view.legalMoves[0] });
  if (ack.ok) await allAt(clients, seq + 1);
  return ack;
};
