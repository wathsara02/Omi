import type { GameSnapshot, RoomSnapshot, Session } from '@omi/protocol';
import { afterEach, describe, expect, test } from 'vitest';
import {
  ALLOWED_ORIGIN,
  FAST_TIMINGS,
  must,
  openTable,
  startServer,
  type Client,
  type Running,
} from './client';

const GENEROUS = { capacity: 1000, refillPerSecond: 0 };
const BAD_TOKEN = 'x'.repeat(43);

let running: Running | undefined;

const boot = async (...args: Parameters<typeof startServer>): Promise<Running> => {
  running = await startServer(...args);
  return running;
};

afterEach(async () => {
  await running?.stop();
  running = undefined;
});

const codeOf = (ack: { ok: boolean; error?: { code: string } }): string =>
  ack.ok ? 'ok' : (ack.error?.code ?? 'unknown');

describe('who may connect', () => {
  test('refuses a socket from an origin that is not on the allowlist', async () => {
    const server = await boot();

    await expect(server.connect({ origin: 'https://evil.example' })).rejects.toThrow();
  });

  test('refuses a socket that sends no origin at all', async () => {
    const server = await boot();

    await expect(server.connect({ origin: null })).rejects.toThrow();
  });

  test('refuses more connections from one address than the cap allows', async () => {
    const server = await boot({ maxConnectionsPerAddress: 2 });
    await server.connect();
    const second = await server.connect();

    await expect(server.connect()).rejects.toThrow();

    second.close();
    await expect
      .poll(() =>
        server.connect().then(
          () => 'connected',
          () => 'refused',
        ),
      )
      .toBe('connected');
  });

  test('refuses connections past the server-wide cap', async () => {
    const server = await boot({ maxConnections: 1 });
    await server.connect();

    await expect(server.connect()).rejects.toThrow();
  });

  test('counts addresses from the proxy header only when told to trust the proxy', async () => {
    const trusting = await boot({ trustProxy: true, maxConnectionsPerAddress: 1 });
    await trusting.connect({ forwardedFor: '203.0.113.1' });
    await trusting.connect({ forwardedFor: '203.0.113.2' });
    await expect(trusting.connect({ forwardedFor: '203.0.113.2' })).rejects.toThrow();
    await trusting.stop();

    const direct = await boot({ maxConnectionsPerAddress: 1 });
    await direct.connect({ forwardedFor: '203.0.113.1' });
    await expect(direct.connect({ forwardedFor: '203.0.113.2' })).rejects.toThrow();
  });

  test('uses the address the trusted proxy appended, not one the client claims', async () => {
    const server = await boot({ trustProxy: true, maxConnectionsPerAddress: 1 });
    await server.connect({ forwardedFor: '198.51.100.9, 203.0.113.1' });

    await expect(server.connect({ forwardedFor: '198.51.100.77, 203.0.113.1' })).rejects.toThrow();
  });
});

describe('the per-address limit on joining', () => {
  const limits = {
    perSocket: GENEROUS,
    perAddress: { capacity: 2, refillPerSecond: 0 },
    resume: GENEROUS,
  };

  test('is not spent by requests that fail validation', async () => {
    const client = await (await boot({ limits })).connect();
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await client.request('room:join', { code: 'not a code', name: '' });
    }

    const ack = await client.request('room:join', { code: 'ZZZZZZ', name: 'Guess' });

    expect(codeOf(ack)).toBe('room-not-found');
  });

  test('does not block a player from reclaiming a seat', async () => {
    const client = await (await boot({ limits })).connect();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await client.request('room:join', { code: 'ZZZZZZ', name: 'Guess' });
    }

    expect(codeOf(await client.request('room:join', { code: 'ZZZZZZ', name: 'Guess' }))).toBe(
      'rate-limited',
    );
    expect(codeOf(await client.request('room:resume', { code: 'ZZZZZZ', token: BAD_TOKEN }))).toBe(
      'session-invalid',
    );
  });

  test('limits token attempts against one room without affecting another', async () => {
    const client = await (
      await boot({
        limits: {
          perSocket: GENEROUS,
          perAddress: GENEROUS,
          resume: { capacity: 2, refillPerSecond: 0 },
        },
      })
    ).connect();
    const attempt = (code: string) => client.request('room:resume', { code, token: BAD_TOKEN });

    const results = [
      await attempt('ZZZZZZ'),
      await attempt('ZZZZZZ'),
      await attempt('ZZZZZZ'),
      await attempt('YYYYYY'),
    ].map(codeOf);

    expect(results).toEqual([
      'session-invalid',
      'session-invalid',
      'rate-limited',
      'session-invalid',
    ]);
  });
});

describe('a seat taken over from another tab', () => {
  test('tells the old socket it has been replaced', async () => {
    const server = await boot();
    const { clients, sessions } = await openTable(server);
    const [old] = clients as [Client];
    const [session] = sessions as [Session];
    const fresh = await server.connect();

    must(await fresh.request('room:resume', { code: session.code, token: session.token }));

    await old.waitFor('session:replaced', () => true);
    expect(codeOf(await old.request('room:leave'))).toBe('not-in-room');
  });
});

describe('a bot over real sockets', () => {
  test('acts for a dropped player, long before any turn timer could', async () => {
    // A one-minute turn timer: within this test only a bot can move the game on.
    const server = await boot({
      timings: { ...FAST_TIMINGS, turnMs: 60_000, holdMs: 100, botDelayMs: 20 },
    });
    const { clients, sessions } = await openTable(server);
    const onTurn = clients.findIndex(
      (client) => client.game().view.turn === client.game().view.seat,
    );
    const dropped = clients[onTurn] as Client;
    const session = sessions[onTurn] as Session;
    const [watcher] = clients.filter((client) => client !== dropped) as [Client];
    const { seq } = watcher.game();

    dropped.close();
    await watcher.waitFor<RoomSnapshot>('room:state', (room) =>
      room.players.some((player) => player.id === session.playerId && player.isBot),
    );
    const next = await watcher.waitFor<GameSnapshot>(
      'game:state',
      (snapshot) => snapshot.seq === seq + 1,
    );

    expect(next.events).toMatchObject([{ type: 'trump-called', seat: dropped.game().view.seat }]);
  });
});

describe('the default origin for these tests', () => {
  test('is accepted', async () => {
    const client = await (await boot()).connect({ origin: ALLOWED_ORIGIN });

    expect(client.socket.connected).toBe(true);
  });
});
