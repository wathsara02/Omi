import {
  createServer,
  type IncomingMessage,
  type Server as HttpServer,
  type ServerResponse,
} from 'node:http';
import type { RulesConfig } from '@omi/engine';
import {
  callTrumpSchema,
  createRoomSchema,
  joinRoomSchema,
  playCardSchema,
  resumeSchema,
  type Ack,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@omi/protocol';
import type { Logger } from 'pino';
import { Server, type Socket } from 'socket.io';
import type { z } from 'zod';
import { fail } from './acks';
import { ConnectionCounter } from './connectionCounter';
import { GameService, type Timings } from './gameService';
import { RateLimiter, type RateLimit } from './rateLimiter';
import { InMemoryRoomStore } from './roomStore';

export interface Limits {
  /** Every request a socket sends, valid or not. */
  readonly perSocket: RateLimit;
  /** Creating and joining rooms, counted per client address across sockets. */
  readonly perAddress: RateLimit;
  /** Token attempts, counted per client address and room code. */
  readonly resume: RateLimit;
}

export const DEFAULT_LIMITS: Limits = {
  perSocket: { capacity: 20, refillPerSecond: 10 },
  // Slow enough that guessing room codes from one address is hopeless.
  perAddress: { capacity: 20, refillPerSecond: 0.5 },
  // Kept apart from joining, so join spam cannot stop a player reclaiming a seat.
  resume: { capacity: 10, refillPerSecond: 0.2 },
};

const DEFAULT_MAX_CONNECTIONS = 4000;
/** Room for a household or a small office behind one address. */
const DEFAULT_MAX_CONNECTIONS_PER_ADDRESS = 12;

export interface OmiServerOptions {
  readonly corsOrigins: readonly string[];
  readonly logger: Logger;
  readonly timings?: Timings;
  readonly maxRooms?: number;
  readonly rules?: RulesConfig;
  readonly limits?: Limits;
  readonly maxConnections?: number;
  readonly maxConnectionsPerAddress?: number;
  /** Read client addresses from X-Forwarded-For. Only behind a proxy you control. */
  readonly trustProxy?: boolean;
}

export interface OmiServer {
  readonly httpServer: HttpServer;
  readonly service: GameService;
  close(): Promise<void>;
}

type OmiSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

interface Route<P> {
  /** null for requests that carry no payload. */
  readonly schema: z.ZodType<P> | null;
  /** The extra limit a valid request is charged against, if any. */
  readonly limitKey?: (address: string, payload: P) => { limiter: RateLimiter; key: string };
  readonly run: (socketId: string, payload: P) => Ack<unknown>;
}

/** Game payloads are a few dozen bytes; anything much larger is not a real client. */
const MAX_MESSAGE_BYTES = 4096;
const PRUNE_INTERVAL_MS = 60_000;

const handleHttp = (request: IncomingMessage, response: ServerResponse): void => {
  const isHealthCheck = request.method === 'GET' && request.url === '/health';
  response.writeHead(isHealthCheck ? 200 : 404, {
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(isHealthCheck ? { status: 'ok' } : { status: 'not-found' }));
};

const headerText = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? value.join(',') : (value ?? '');

/**
 * The address limits are counted against. Behind a trusted proxy this is the
 * last X-Forwarded-For entry, the one the proxy itself appended; anything
 * before it was supplied by the client and cannot be believed.
 */
const addressOf = (socket: OmiSocket, trustProxy: boolean): string => {
  const direct = socket.handshake.address;
  if (!trustProxy) return direct;
  const forwarded = headerText(socket.handshake.headers['x-forwarded-for'])
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
  return forwarded.at(-1) ?? direct;
};

const define = <P>(route: Route<P>): Route<unknown> => route as Route<unknown>;

export const createOmiServer = (options: OmiServerOptions): OmiServer => {
  const { logger } = options;
  const limits = options.limits ?? DEFAULT_LIMITS;
  const trustProxy = options.trustProxy ?? false;
  const allowedOrigins = new Set(options.corsOrigins);
  const socketLimiter = new RateLimiter(limits.perSocket);
  const entryLimiter = new RateLimiter(limits.perAddress);
  const resumeLimiter = new RateLimiter(limits.resume);
  const connections = new ConnectionCounter({
    total: options.maxConnections ?? DEFAULT_MAX_CONNECTIONS,
    perAddress: options.maxConnectionsPerAddress ?? DEFAULT_MAX_CONNECTIONS_PER_ADDRESS,
  });

  const httpServer = createServer(handleHttp);
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: { origin: [...allowedOrigins] },
    // Browsers do not apply CORS to WebSocket upgrades, so the Origin header is
    // checked here for every transport. This keeps other websites out; it does
    // not stop a non-browser client, which the limits below are for.
    allowRequest: (request, decide) => {
      decide(null, allowedOrigins.has(headerText(request.headers.origin)));
    },
    maxHttpBufferSize: MAX_MESSAGE_BYTES,
    serveClient: false,
  });
  const service = new GameService({
    store: new InMemoryRoomStore(),
    // Always addressed to one socket id; game data is never sent to a group.
    emit: (socketId, event, payload) => {
      io.to(socketId).emit(event, ...([payload] as Parameters<ServerToClientEvents[typeof event]>));
    },
    logger,
    ...(options.timings && { timings: options.timings }),
    ...(options.maxRooms !== undefined && { maxRooms: options.maxRooms }),
    ...(options.rules && { rules: options.rules }),
  });

  const perAddress = (address: string): { limiter: RateLimiter; key: string } => ({
    limiter: entryLimiter,
    key: address,
  });
  const routes: Readonly<Record<keyof ClientToServerEvents, Route<unknown>>> = {
    'room:create': define({
      schema: createRoomSchema,
      limitKey: perAddress,
      run: (id, payload) => service.createRoom(id, payload),
    }),
    'room:join': define({
      schema: joinRoomSchema,
      limitKey: perAddress,
      run: (id, payload) => service.joinRoom(id, payload),
    }),
    'room:resume': define({
      schema: resumeSchema,
      limitKey: (address, payload) => ({
        limiter: resumeLimiter,
        key: `${address}|${payload.code}`,
      }),
      run: (id, payload) => service.resume(id, payload),
    }),
    'room:start': define({ schema: null, run: (id) => service.start(id) }),
    'room:leave': define({ schema: null, run: (id) => service.leave(id) }),
    'game:call-trump': define({
      schema: callTrumpSchema,
      run: (id, payload) => service.callTrump(id, payload),
    }),
    'game:play-card': define({
      schema: playCardSchema,
      run: (id, payload) => service.playCard(id, payload),
    }),
  };

  /** Runs one request: rate limits, validates the payload, then answers through the ack. */
  const answer = (
    socket: OmiSocket,
    address: string,
    route: Route<unknown>,
    args: readonly unknown[],
  ): void => {
    const ack = args.at(-1);
    // A request with no acknowledgement callback cannot be answered; drop it.
    if (typeof ack !== 'function') return;
    const respond = (response: Ack<unknown>): void => {
      (ack as (response: Ack<unknown>) => void)(response);
    };

    if (!socketLimiter.allow(socket.id)) return respond(fail('rate-limited'));
    const expectedArgs = route.schema ? 2 : 1;
    const parsed = route.schema?.safeParse(args[0]);
    if (args.length !== expectedArgs || parsed?.success === false) {
      return respond(fail('invalid-payload'));
    }
    // Charged only once the request is well formed, so junk cannot use up a
    // budget that honest players behind the same address share.
    const charge = route.limitKey?.(address, parsed?.data);
    if (charge && !charge.limiter.allow(charge.key)) return respond(fail('rate-limited'));
    try {
      respond(route.run(socket.id, parsed?.data));
    } catch (error: unknown) {
      logger.error({ err: error }, 'request failed');
      respond(fail('internal'));
    }
  };

  io.use((socket, next) => {
    const address = addressOf(socket, trustProxy);
    if (!connections.tryAdd(address)) {
      next(new Error('Too many connections'));
      return;
    }
    socket.data = { address };
    next();
  });

  io.on('connection', (socket) => {
    const { address } = socket.data as { address: string };
    const listen = socket.on.bind(socket) as (
      event: string,
      listener: (...args: unknown[]) => void,
    ) => void;
    for (const [event, route] of Object.entries(routes)) {
      listen(event, (...args) => answer(socket, address, route, args));
    }
    socket.on('disconnect', () => {
      connections.remove(address);
      socketLimiter.forget(socket.id);
      service.disconnect(socket.id);
    });
  });

  const pruning = setInterval(() => {
    entryLimiter.prune();
    resumeLimiter.prune();
  }, PRUNE_INTERVAL_MS);
  pruning.unref();

  const close = async (): Promise<void> => {
    clearInterval(pruning);
    service.close();
    await io.close();
  };
  return { httpServer, service, close };
};
