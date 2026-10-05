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
import { GameService, type Timings } from './gameService';
import { RateLimiter, type RateLimit } from './rateLimiter';
import { InMemoryRoomStore } from './roomStore';

export interface Limits {
  /** Every request a socket sends. */
  readonly perSocket: RateLimit;
  /** Creating, joining and resuming, counted per client address across sockets. */
  readonly perAddress: RateLimit;
}

export const DEFAULT_LIMITS: Limits = {
  perSocket: { capacity: 20, refillPerSecond: 10 },
  // Slow enough that guessing room codes or tokens from one address is hopeless.
  perAddress: { capacity: 20, refillPerSecond: 0.5 },
};

export interface OmiServerOptions {
  readonly corsOrigins: readonly string[];
  readonly logger: Logger;
  readonly timings?: Timings;
  readonly maxRooms?: number;
  readonly rules?: RulesConfig;
  readonly limits?: Limits;
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
  /** True for requests that could be used to guess codes or tokens. */
  readonly guarded?: boolean;
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

const define = <P>(route: Route<P>): Route<unknown> => route as Route<unknown>;

const routesFor = (
  service: GameService,
): Readonly<Record<keyof ClientToServerEvents, Route<unknown>>> => ({
  'room:create': define({
    schema: createRoomSchema,
    guarded: true,
    run: (id, payload) => service.createRoom(id, payload),
  }),
  'room:join': define({
    schema: joinRoomSchema,
    guarded: true,
    run: (id, payload) => service.joinRoom(id, payload),
  }),
  'room:resume': define({
    schema: resumeSchema,
    guarded: true,
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
});

export const createOmiServer = (options: OmiServerOptions): OmiServer => {
  const { logger } = options;
  const limits = options.limits ?? DEFAULT_LIMITS;
  const socketLimiter = new RateLimiter(limits.perSocket);
  const addressLimiter = new RateLimiter(limits.perAddress);

  const httpServer = createServer(handleHttp);
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: { origin: [...options.corsOrigins] },
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
  const routes = routesFor(service);

  /** Runs one request: rate limits, validates the payload, then answers through the ack. */
  const answer = (socket: OmiSocket, route: Route<unknown>, args: readonly unknown[]): void => {
    const ack = args.at(-1);
    // A request with no acknowledgement callback cannot be answered; drop it.
    if (typeof ack !== 'function') return;
    const respond = (response: Ack<unknown>): void => {
      (ack as (response: Ack<unknown>) => void)(response);
    };

    if (!socketLimiter.allow(socket.id)) return respond(fail('rate-limited'));
    if (route.guarded && !addressLimiter.allow(socket.handshake.address)) {
      return respond(fail('rate-limited'));
    }
    const expectedArgs = route.schema ? 2 : 1;
    const parsed = route.schema?.safeParse(args[0]);
    if (args.length !== expectedArgs || parsed?.success === false) {
      return respond(fail('invalid-payload'));
    }
    try {
      respond(route.run(socket.id, parsed?.data));
    } catch (error: unknown) {
      logger.error({ err: error, socket: socket.id }, 'request failed');
      respond(fail('internal'));
    }
  };

  io.on('connection', (socket) => {
    const listen = socket.on.bind(socket) as (
      event: string,
      listener: (...args: unknown[]) => void,
    ) => void;
    for (const [event, route] of Object.entries(routes)) {
      listen(event, (...args) => answer(socket, route, args));
    }
    socket.on('disconnect', () => {
      socketLimiter.forget(socket.id);
      service.disconnect(socket.id);
    });
  });

  const pruning = setInterval(() => addressLimiter.prune(), PRUNE_INTERVAL_MS);
  pruning.unref();

  const close = async (): Promise<void> => {
    clearInterval(pruning);
    service.close();
    await io.close();
  };
  return { httpServer, service, close };
};
