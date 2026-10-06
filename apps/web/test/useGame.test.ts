import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test } from 'vitest';
import { createConnection } from '../src/net/connection';
import { loadName, loadSession, saveSession } from '../src/net/session';
import { useGame } from '../src/state/useGame';
import { FakeSocket, failed, ok } from './fakeSocket';
import { SERVER_NOW, playingSnapshot, roomSnapshot } from './fixtures';

const SESSION = { code: 'KXT4P9', playerId: 'p0', token: 't'.repeat(43) };

const setup = (path = '/') => {
  window.history.replaceState(null, '', path);
  const socket = new FakeSocket();
  // One connection for the life of the hook, as the app has.
  const connection = createConnection(socket);
  const hook = renderHook(() => useGame(connection));
  return { socket, ...hook };
};

beforeEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('connection and snapshots', () => {
  test('follows the socket going online and offline', () => {
    const socket = new FakeSocket();
    const connection = createConnection(socket);
    const { result } = renderHook(() => useGame(connection));

    act(() => socket.goOnline());
    expect(result.current.state.isOnline).toBe(true);

    act(() => socket.goOffline());
    expect(result.current.state.isOnline).toBe(false);
    expect(result.current.state.offlineSince).not.toBeNull();
  });

  test('keeps the latest room and game the server sent', () => {
    const socket = new FakeSocket();
    const connection = createConnection(socket);
    const { result } = renderHook(() => useGame(connection));

    act(() => {
      socket.receive('room:state', roomSnapshot());
      socket.receive('game:state', playingSnapshot());
    });

    expect(result.current.state.room?.code).toBe('KXT4P9');
    expect(result.current.state.game?.serverNow).toBe(SERVER_NOW);
  });
});

describe('creating and joining', () => {
  test('saves the seat and the name, and moves to the room link', async () => {
    const socket = new FakeSocket();
    const connection = createConnection(socket);
    socket.respond('room:create', () => ok(SESSION));
    const { result } = renderHook(() => useGame(connection));
    act(() => socket.goOnline());

    await act(() => result.current.createRoom('Ruwan'));

    expect(loadSession('KXT4P9')).toEqual({ playerId: 'p0', token: SESSION.token });
    expect(loadName()).toBe('Ruwan');
    expect(window.location.pathname).toBe('/r/KXT4P9');
    expect(result.current.route).toEqual({ name: 'room', code: 'KXT4P9' });
  });

  test('does not try to reclaim a seat it has just been given', async () => {
    const socket = new FakeSocket();
    const connection = createConnection(socket);
    socket.respond('room:join', () => ok(SESSION));
    const { result } = renderHook(() => useGame(connection));
    act(() => socket.goOnline());

    await act(() => result.current.joinRoom('KXT4P9', 'Ruwan'));

    expect(socket.requestsOf('room:resume')).toEqual([]);
  });

  test('stays put and hands back the refusal when the server says no', async () => {
    const socket = new FakeSocket();
    const connection = createConnection(socket);
    socket.respond('room:join', () => failed('room-full'));
    const { result } = renderHook(() => useGame(connection));

    const ack = await act(() => result.current.joinRoom('KXT4P9', 'Ruwan'));

    expect(ack).toEqual(failed('room-full'));
    expect(window.location.pathname).toBe('/');
    expect(loadSession('KXT4P9')).toBeNull();
  });
});

describe('reclaiming a seat', () => {
  test('happens on connect when the room link has a saved seat', async () => {
    saveSession('KXT4P9', SESSION);
    const { socket } = setup('/r/KXT4P9');
    socket.respond('room:resume', () => ok({ code: 'KXT4P9', playerId: 'p0' }));

    act(() => socket.goOnline());

    await waitFor(() =>
      expect(socket.requestsOf('room:resume')).toEqual([
        { event: 'room:resume', payload: [{ code: 'KXT4P9', token: SESSION.token }] },
      ]),
    );
  });

  test('does not happen without a saved seat', () => {
    const { socket } = setup('/r/KXT4P9');

    act(() => socket.goOnline());

    expect(socket.requestsOf('room:resume')).toEqual([]);
  });

  test('happens again after the connection drops and returns', async () => {
    saveSession('KXT4P9', SESSION);
    const { socket } = setup('/r/KXT4P9');
    socket.respond('room:resume', () => ok({ code: 'KXT4P9', playerId: 'p0' }));

    act(() => socket.goOnline());
    act(() => socket.goOffline());
    act(() => socket.goOnline());

    await waitFor(() => expect(socket.requestsOf('room:resume')).toHaveLength(2));
  });

  test('forgets a seat the server no longer accepts', async () => {
    saveSession('KXT4P9', SESSION);
    const { socket, result } = setup('/r/KXT4P9');
    socket.respond('room:resume', () => failed('session-invalid'));

    act(() => socket.goOnline());

    await waitFor(() => expect(loadSession('KXT4P9')).toBeNull());
    await waitFor(() => expect(result.current.isResuming).toBe(false));
  });

  test('reports that it is in progress', async () => {
    saveSession('KXT4P9', SESSION);
    const { socket, result } = setup('/r/KXT4P9');
    let answer: (value: unknown) => void = () => undefined;
    socket.respond('room:resume', () => new Promise((resolve) => (answer = resolve)) as never);

    act(() => socket.goOnline());
    await waitFor(() => expect(result.current.isResuming).toBe(true));

    await act(async () => answer(ok({ code: 'KXT4P9', playerId: 'p0' })));
    expect(result.current.isResuming).toBe(false);
  });
});

describe('being moved out of a room', () => {
  test('forgets the seat when the host removes the player', async () => {
    saveSession('KXT4P9', SESSION);
    const { socket, result } = setup('/r/KXT4P9');
    act(() => socket.receive('room:state', roomSnapshot()));

    act(() => socket.receive('room:closed', 'kicked'));

    expect(result.current.state).toMatchObject({ room: null, closed: 'kicked' });
    await waitFor(() => expect(loadSession('KXT4P9')).toBeNull());
  });

  test('keeps the seat when another tab takes it, and can take it back', async () => {
    saveSession('KXT4P9', SESSION);
    const { socket, result } = setup('/r/KXT4P9');
    socket.respond('room:resume', () => ok({ code: 'KXT4P9', playerId: 'p0' }));
    act(() => socket.receive('room:state', roomSnapshot()));

    act(() => socket.receive('session:replaced', 'resumed-elsewhere'));
    expect(result.current.state.closed).toBe('replaced');
    expect(loadSession('KXT4P9')).not.toBeNull();

    const ack = await act(() => result.current.playHere());
    expect(ack.ok).toBe(true);
    expect(socket.requestsOf('room:resume')).toHaveLength(1);
  });

  test('cannot take a seat back with nothing saved', async () => {
    const { result } = setup('/r/KXT4P9');

    const ack = await act(() => result.current.playHere());

    expect(ack).toMatchObject({ ok: false, error: { code: 'session-invalid' } });
  });
});

describe('leaving', () => {
  test('tells the server, forgets the seat and returns home', async () => {
    saveSession('KXT4P9', SESSION);
    const { socket, result } = setup('/r/KXT4P9');
    socket.respond('room:leave', () => ok(null));
    act(() => socket.receive('room:state', roomSnapshot()));

    await act(() => result.current.leaveRoom());

    expect(socket.requestsOf('room:leave')).toHaveLength(1);
    expect(loadSession('KXT4P9')).toBeNull();
    expect(result.current.state.room).toBeNull();
    expect(result.current.route).toEqual({ name: 'home' });
  });

  test('going home clears the room without telling the server', () => {
    const { socket, result } = setup('/r/KXT4P9');
    act(() => socket.receive('room:closed', 'expired'));

    act(() => result.current.goHome());

    expect(result.current.state.closed).toBeNull();
    expect(window.location.pathname).toBe('/');
    expect(socket.sent).toEqual([]);
  });
});

describe('acting in a match', () => {
  test('sends moves with the sequence number of the latest game state', async () => {
    const { socket, result } = setup('/r/KXT4P9');
    const snapshot = playingSnapshot(2);
    const card = snapshot.view.legalMoves[0];
    if (!card) throw new Error('No legal card in fixture');
    socket.respond('game:play-card', () => ok(null));
    socket.respond('game:call-trump', () => ok(null));
    act(() => socket.receive('game:state', snapshot));

    await act(() => result.current.playCard(card));
    await act(() => result.current.callTrump('hearts'));

    expect(socket.sent).toEqual([
      { event: 'game:play-card', payload: [{ seq: snapshot.seq, card }] },
      { event: 'game:call-trump', payload: [{ seq: snapshot.seq, suit: 'hearts' }] },
    ]);
  });

  test('refuses moves when there is no match, without asking the server', async () => {
    const { socket, result } = setup();

    const ack = await act(() => result.current.callTrump('hearts'));

    expect(ack).toMatchObject({ ok: false, error: { code: 'no-match' } });
    expect(socket.sent).toEqual([]);
  });

  test('passes start and kick straight to the server', async () => {
    const { socket, result } = setup('/r/KXT4P9');
    socket.respond('room:start', () => ok(null));
    socket.respond('room:kick', () => ok(null));

    await act(() => result.current.startMatch());
    await act(() => result.current.kick('p2'));

    expect(socket.sent).toEqual([
      { event: 'room:start', payload: [] },
      { event: 'room:kick', payload: [{ playerId: 'p2' }] },
    ]);
  });
});
