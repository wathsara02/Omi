import type { RoomSnapshot, Session } from '@omi/protocol';
import { afterEach, describe, expect, test } from 'vitest';
import { FAST_TIMINGS, must, startServer, type Running } from './client';

let running: Running | undefined;

const boot = async (...args: Parameters<typeof startServer>): Promise<Running> => {
  running = await startServer(...args);
  return running;
};

afterEach(async () => {
  await running?.stop();
  running = undefined;
});

const lobbyOfTwo = async (server: Running) => {
  const [host, guest] = await Promise.all([server.connect(), server.connect()]);
  const session = must(await host.request<Session>('room:create', { name: 'Host' }));
  const joined = must(
    await guest.request<Session>('room:join', { code: session.code, name: 'Guest' }),
  );
  await host.waitFor<RoomSnapshot>('room:state', (room) => room.players.length === 2);
  return { host, guest, code: session.code, guestId: joined.playerId };
};

describe('kicking over real sockets', () => {
  test('removes the guest, tells them, and updates the host', async () => {
    const { host, guest, guestId } = await lobbyOfTwo(await boot());

    must(await host.request('room:kick', { playerId: guestId }));

    expect(await guest.waitFor<string>('room:closed', () => true)).toBe('kicked');
    const room = await host.waitFor<RoomSnapshot>(
      'room:state',
      (snapshot) => snapshot.players.length === 1,
    );
    expect(room.players.map((player) => player.name)).toEqual(['Host']);
  });

  test('is refused for a guest', async () => {
    const { host, guest } = await lobbyOfTwo(await boot());

    const ack = await guest.request('room:kick', { playerId: host.room().youId });

    expect(ack).toMatchObject({ ok: false, error: { code: 'not-host' } });
  });

  test('is refused for a malformed player id', async () => {
    const { host } = await lobbyOfTwo(await boot());

    expect(await host.request('room:kick', { playerId: 'nope' })).toMatchObject({
      ok: false,
      error: { code: 'invalid-payload' },
    });
  });
});

describe('an idle lobby over real sockets', () => {
  test('is closed for everyone in it', async () => {
    const server = await boot({ timings: { ...FAST_TIMINGS, idleRoomMs: 150 } });
    const { host, guest, code } = await lobbyOfTwo(server);

    expect(await host.waitFor<string>('room:closed', () => true)).toBe('expired');
    expect(await guest.waitFor<string>('room:closed', () => true)).toBe('expired');
    expect(await guest.request('room:join', { code, name: 'Guest' })).toMatchObject({
      ok: false,
      error: { code: 'room-not-found' },
    });
  });
});
