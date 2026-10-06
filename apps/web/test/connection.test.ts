import { describe, expect, test, vi } from 'vitest';
import { createConnection } from '../src/net/connection';
import { FakeSocket, failed, ok } from './fakeSocket';

const setup = () => {
  const socket = new FakeSocket();
  return { socket, connection: createConnection(socket) };
};

describe('requests', () => {
  test('send the event with its payload and return the server’s answer', async () => {
    const { socket, connection } = setup();
    const session = { code: 'ABC234', playerId: 'p1', token: 't1' };
    socket.respond('room:create', () => ok(session));

    const ack = await connection.createRoom('Ruwan');

    expect(socket.sent).toEqual([{ event: 'room:create', payload: [{ name: 'Ruwan' }] }]);
    expect(ack).toEqual(ok(session));
  });

  test('pass the server’s refusal through unchanged', async () => {
    const { socket, connection } = setup();
    socket.respond('room:join', () => failed('room-full'));

    const ack = await connection.joinRoom('ABC234', 'Kamala');

    expect(ack).toEqual(failed('room-full'));
  });

  test('become a readable failure when the server does not answer', async () => {
    const { connection } = setup();

    const ack = await connection.start();

    expect(ack).toMatchObject({ ok: false, error: { code: 'internal' } });
    expect(!ack.ok && ack.error.message).toMatch(/server/i);
  });

  test.each([
    ['joinRoom', ['ABC234', 'Kamala'], 'room:join', [{ code: 'ABC234', name: 'Kamala' }]],
    ['resume', ['ABC234', 'tok'], 'room:resume', [{ code: 'ABC234', token: 'tok' }]],
    ['start', [], 'room:start', []],
    ['leave', [], 'room:leave', []],
    ['kick', ['p2'], 'room:kick', [{ playerId: 'p2' }]],
    ['callTrump', [3, 'hearts'], 'game:call-trump', [{ seq: 3, suit: 'hearts' }]],
    [
      'playCard',
      [4, { suit: 'spades', rank: 'A' }],
      'game:play-card',
      [{ seq: 4, card: { suit: 'spades', rank: 'A' } }],
    ],
  ] as const)('%s sends %s', async (method, args, event, payload) => {
    const { socket, connection } = setup();
    socket.respond(event, () => ok(null));

    await (connection[method] as (...values: unknown[]) => Promise<unknown>)(...args);

    expect(socket.sent).toEqual([{ event, payload }]);
  });
});

describe('messages from the server', () => {
  test('reach every subscriber until it unsubscribes', () => {
    const { socket, connection } = setup();
    const handler = vi.fn();
    const stop = connection.on('room:state', handler);

    socket.receive('room:state', { code: 'ABC234' });
    stop();
    socket.receive('room:state', { code: 'ABC234' });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ code: 'ABC234' });
  });
});

describe('connection status', () => {
  test('reports the current state straight away, then every change', () => {
    const { socket, connection } = setup();
    const statuses: boolean[] = [];

    connection.onStatus((isOnline) => statuses.push(isOnline));
    socket.goOnline();
    socket.goOffline();

    expect(statuses).toEqual([false, true, false]);
  });

  test('stops reporting after unsubscribing', () => {
    const { socket, connection } = setup();
    const statuses: boolean[] = [];

    const stop = connection.onStatus((isOnline) => statuses.push(isOnline));
    stop();
    socket.goOnline();

    expect(statuses).toEqual([false]);
  });
});

describe('closing', () => {
  test('closes the socket', () => {
    const { socket, connection } = setup();

    connection.close();

    expect(socket.closed).toBe(true);
  });
});
