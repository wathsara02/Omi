import { DEFAULT_RULES, cardKey } from '@omi/engine';
import type { GameSnapshot, ResumedSession, RoomSnapshot, Session } from '@omi/protocol';
import { afterEach, describe, expect, test } from 'vitest';
import {
  ALLOWED_ORIGIN,
  FAST_TIMINGS,
  actOnce,
  allAt,
  must,
  openTable,
  startServer,
  type Client,
  type Running,
} from './client';
import { collectCards, collectKeys } from './harness';

const SECRET_KEYS = ['rng', 'stock', 'hands', 'tokenHash', 'socketId', 'match', 'seed'];

let running: Running | undefined;

const boot = async (...args: Parameters<typeof startServer>): Promise<Running> => {
  running = await startServer(...args);
  return running;
};

afterEach(async () => {
  await running?.stop();
  running = undefined;
});

const cardsEverSentTo = (client: Client): Set<string> =>
  new Set(client.frames.flatMap((frame) => collectCards(frame.payload).map(cardKey)));

const phaseOf = (client: Client): string => client.game().view.phase;

const playRound = async (clients: readonly Client[]): Promise<void> => {
  while (
    phaseOf(clients[0] as Client) === 'calling-trump' ||
    phaseOf(clients[0] as Client) === 'playing'
  ) {
    must(await actOnce(clients));
  }
};

describe('http', () => {
  test('answers the health check', async () => {
    const { url } = await boot();

    const response = await fetch(`${url}/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  test('answers 404 for anything else', async () => {
    const { url } = await boot();

    expect((await fetch(`${url}/rooms`)).status).toBe(404);
  });

  test('allows only the configured origin to open a socket from a browser', async () => {
    const { url } = await boot();
    const handshake = `${url}/socket.io/?EIO=4&transport=polling`;

    const allowed = await fetch(handshake, { headers: { Origin: ALLOWED_ORIGIN } });
    const other = await fetch(handshake, { headers: { Origin: 'https://evil.example' } });

    expect(allowed.headers.get('access-control-allow-origin')).toBe(ALLOWED_ORIGIN);
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('a match over real sockets', () => {
  test('deals each player their own 4 cards and nobody else’s', async () => {
    const { clients } = await openTable(await boot());

    const sent = clients.map(cardsEverSentTo);

    expect(sent.map((cards) => cards.size)).toEqual([4, 4, 4, 4]);
    expect(new Set(sent.flatMap((cards) => [...cards])).size).toBe(16);
  });

  test('sends the second 4 cards only after trump is called, still one hand each', async () => {
    const { clients } = await openTable(await boot());

    must(await actOnce(clients));
    const sent = clients.map(cardsEverSentTo);

    expect(sent.map((cards) => cards.size)).toEqual([8, 8, 8, 8]);
    expect(new Set(sent.flatMap((cards) => [...cards])).size).toBe(32);
  });

  test('plays a full round with no frame carrying a hidden card or a server-only field', async () => {
    const { clients } = await openTable(await boot());

    await playRound(clients);

    for (const client of clients) {
      const leaks = client.frames
        .filter((frame) => frame.event === 'game:state')
        .flatMap((frame) => {
          const { view } = frame.payload as GameSnapshot;
          const allowed = new Set(
            collectCards([view.hand, view.currentTrick, view.previousTrick]).map(cardKey),
          );
          return collectCards(frame.payload).filter((card) => !allowed.has(cardKey(card)));
        });
      const keys = client.frames.flatMap((frame) => collectKeys(frame.payload));

      expect(leaks).toEqual([]);
      expect(keys.filter((key) => SECRET_KEYS.includes(key))).toEqual([]);
      expect(phaseOf(client)).toMatch(/round-scored|match-over/);
    }
  });

  test('deals the next round after the pause and finishes the match at the target', async () => {
    const server = await boot({ rules: { ...DEFAULT_RULES, tokenTarget: 2 } });
    const { clients } = await openTable(server);
    const [first] = clients as [Client];

    while (first.room().status === 'playing') {
      await playRound(clients);
      if (phaseOf(first) === 'match-over') break;
      const { roundNumber } = first.game().view;
      await Promise.all(
        clients.map((client) =>
          client.waitFor<GameSnapshot>(
            'game:state',
            (snapshot) => snapshot.view.roundNumber > roundNumber,
          ),
        ),
      );
    }
    await first.waitFor<RoomSnapshot>('room:state', (room) => room.status === 'finished');

    expect(first.game().view.winner).not.toBeNull();
  });
});

describe('untrusted input over real sockets', () => {
  test('refuses a card the player does not hold', async () => {
    const { clients } = await openTable(await boot());
    must(await actOnce(clients));
    const acting = clients.find((client) => client.game().view.turn === client.game().view.seat);
    const other = clients.find((client) => client !== acting);
    const [stolen] = other?.game().view.hand ?? [];

    const ack = await acting?.request('game:play-card', { seq: acting.game().seq, card: stolen });

    expect(ack).toMatchObject({ ok: false, error: { code: 'card-not-in-hand' } });
  });

  test.each([
    ['a seat chosen by the client', 'game:call-trump', { seq: 0, suit: 'hearts', seat: 1 }],
    ['an unknown suit', 'game:call-trump', { seq: 0, suit: 'no-trump' }],
    [
      'a card with extra properties',
      'game:play-card',
      { seq: 0, card: { suit: 'hearts', rank: 'A', x: 1 } },
    ],
    ['a name that is too long', 'room:create', { name: 'x'.repeat(21) }],
    ['a payload that is not an object', 'room:join', 'ABC234'],
  ])('refuses %s as an invalid payload', async (_label, event, payload) => {
    const client = await (await boot()).connect();

    expect(await client.request(event, payload)).toMatchObject({
      ok: false,
      error: { code: 'invalid-payload' },
    });
  });

  test('refuses a request with the wrong number of arguments', async () => {
    const client = await (await boot()).connect();

    expect(await client.request('room:start', { extra: true })).toMatchObject({
      ok: false,
      error: { code: 'invalid-payload' },
    });
  });

  test('ignores a request sent without an acknowledgement and stays up', async () => {
    const client = await (await boot()).connect();

    client.socket.emit('room:create', { name: 'Nimal' });
    client.socket.emit('no-such-event', { anything: true });

    expect(await client.request('room:start')).toMatchObject({
      ok: false,
      error: { code: 'not-in-room' },
    });
  });

  test('limits how fast one socket may send requests', async () => {
    const server = await boot({
      limits: {
        perSocket: { capacity: 5, refillPerSecond: 0 },
        perAddress: { capacity: 100, refillPerSecond: 0 },
      },
    });
    const client = await server.connect();

    const acks = await Promise.all(Array.from({ length: 9 }, () => client.request('room:start')));

    expect(acks.filter((ack) => !ack.ok && ack.error.code === 'rate-limited')).toHaveLength(4);
  });

  test('limits how fast one address may try room codes', async () => {
    const server = await boot({
      limits: {
        perSocket: { capacity: 100, refillPerSecond: 0 },
        perAddress: { capacity: 3, refillPerSecond: 0 },
      },
    });
    const [first, second] = await Promise.all([server.connect(), server.connect()]);
    const guess = { code: 'ZZZZZZ', name: 'Guess' };

    const acks = [
      await first.request('room:join', guess),
      await first.request('room:join', guess),
      await second.request('room:join', guess),
      await second.request('room:join', guess),
    ];

    expect(acks.map((ack) => (ack.ok ? 'ok' : ack.error.code))).toEqual([
      'room-not-found',
      'room-not-found',
      'room-not-found',
      'rate-limited',
    ]);
  });
});

describe('presence over real sockets', () => {
  test('lets a player who drops come back to the same seat and hand', async () => {
    const server = await boot({ timings: { ...FAST_TIMINGS, holdMs: 5000 } });
    const { clients, sessions } = await openTable(server);
    const [dropped, ...rest] = clients as [Client, Client, Client, Client];
    const [session] = sessions as [Session];
    const hand = dropped.game().view.hand;

    dropped.close();
    await rest[0].waitFor<RoomSnapshot>('room:state', (room) =>
      room.players.some((player) => player.id === session.playerId && !player.isConnected),
    );
    const back = await server.connect();
    const resumed = must(
      await back.request<ResumedSession>('room:resume', {
        code: session.code,
        token: session.token,
      }),
    );
    await back.waitFor('game:state', () => true);

    expect(resumed.playerId).toBe(session.playerId);
    expect(back.game().view.hand).toEqual(hand);
    await expect
      .poll(
        () => rest[0].room().players.find((player) => player.id === session.playerId)?.isConnected,
      )
      .toBe(true);
  });

  test('refuses to restore a seat with a wrong token', async () => {
    const server = await boot();
    const { code } = await openTable(server);
    const stranger = await server.connect();

    const ack = await stranger.request('room:resume', { code, token: 'x'.repeat(43) });

    expect(ack).toMatchObject({ ok: false, error: { code: 'session-invalid' } });
    expect(stranger.frames).toEqual([]);
  });

  test('hands a seat to a bot after the hold and keeps the match moving', async () => {
    const server = await boot({ timings: { ...FAST_TIMINGS, turnMs: 150 } });
    const { clients, sessions } = await openTable(server);
    const [dropped, ...rest] = clients as [Client, Client, Client, Client];
    const [session] = sessions as [Session];
    const seqBefore = rest[0].game().seq;

    dropped.close();
    const room = await rest[0].waitFor<RoomSnapshot>('room:state', (snapshot) =>
      snapshot.players.some((player) => player.id === session.playerId && player.isBot),
    );
    // Nobody acts: the three humans time out and the bot plays its own turns.
    await allAt(rest, seqBefore + 8);

    expect(room.status).toBe('playing');
    expect(rest[0].game().seq).toBeGreaterThanOrEqual(seqBefore + 8);
  });

  test('removes the room when every player has gone', async () => {
    const server = await boot({
      limits: {
        perSocket: { capacity: 1000, refillPerSecond: 0 },
        perAddress: { capacity: 1000, refillPerSecond: 0 },
      },
    });
    const { clients, code } = await openTable(server);

    for (const client of clients) client.close();
    const late = await server.connect();
    await expect
      .poll(async () => {
        const ack = await late.request('room:join', { code, name: 'Late' });
        return ack.ok ? 'ok' : ack.error.code;
      })
      .toBe('room-not-found');
  });
});
