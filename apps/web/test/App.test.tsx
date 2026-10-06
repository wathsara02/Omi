import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test } from 'vitest';
import { App } from '../src/App';
import { createConnection } from '../src/net/connection';
import { loadSession, saveSession } from '../src/net/session';
import { FakeSocket, failed, ok } from './fakeSocket';
import {
  autoUntil,
  lobbySnapshot,
  newMatch,
  playingSnapshot,
  roomSnapshot,
  snapshotFor,
  trumpCallSnapshot,
} from './fixtures';

const SESSION = { code: 'KXT4P9', playerId: 'p0', token: 't'.repeat(43) };

const open = (path = '/') => {
  window.history.replaceState(null, '', path);
  const socket = new FakeSocket();
  const user = userEvent.setup();
  render(<App connection={createConnection(socket)} />);
  return { socket, user };
};

beforeEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('from the home screen', () => {
  test('creating a room leads to its lobby', async () => {
    const { socket, user } = open();
    socket.respond('room:create', () => ok(SESSION));
    act(() => socket.goOnline());

    await user.type(screen.getByLabelText('Your name'), 'Ruwan');
    await user.click(screen.getByRole('button', { name: 'Create a room' }));
    act(() => socket.receive('room:state', lobbySnapshot(1)));

    expect(await screen.findByRole('heading', { name: 'Players' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/r/KXT4P9');
  });

  test('a refused join stays on the home screen with the reason', async () => {
    const { socket, user } = open();
    socket.respond('room:join', () => failed('room-not-found'));
    act(() => socket.goOnline());

    await user.type(screen.getByLabelText('Your name'), 'Kamala');
    await user.type(screen.getByLabelText('Room code'), 'KXT4P9');
    await user.click(screen.getByRole('button', { name: 'Join' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('room-not-found');
    expect(window.location.pathname).toBe('/');
  });
});

describe('opening a room link', () => {
  test('with no saved seat asks for a name, with the code filled in', () => {
    const { socket } = open('/r/KXT4P9');
    act(() => socket.goOnline());

    expect(screen.getByLabelText('Room code')).toHaveValue('KXT4P9');
    expect(screen.getByRole('button', { name: 'Join' })).toBeInTheDocument();
  });

  test('with a saved seat takes it back and shows the table', async () => {
    saveSession('KXT4P9', SESSION);
    const { socket } = open('/r/KXT4P9');
    socket.respond('room:resume', () => ok({ code: 'KXT4P9', playerId: 'p0' }));
    expect(screen.getByRole('status')).toHaveTextContent('Taking your seat…');

    act(() => socket.goOnline());
    const game = playingSnapshot(1);
    act(() => {
      socket.receive('room:state', roomSnapshot({ youId: `p${game.view.seat}` }));
      socket.receive('game:state', game);
    });

    expect(await screen.findByRole('heading', { name: 'Your turn' })).toBeInTheDocument();
  });

  test('falls back to joining when the saved seat is no longer valid', async () => {
    saveSession('KXT4P9', SESSION);
    const { socket } = open('/r/KXT4P9');
    socket.respond('room:resume', () => failed('session-invalid'));

    act(() => socket.goOnline());

    expect(await screen.findByRole('button', { name: 'Join' })).toBeInTheDocument();
    expect(loadSession('KXT4P9')).toBeNull();
  });
});

describe('in a room', () => {
  const seated = (path = '/r/KXT4P9') => {
    const opened = open(path);
    act(() => opened.socket.goOnline());
    return opened;
  };

  test('shows the lobby before the match and lets the player leave', async () => {
    const { socket, user } = seated();
    socket.respond('room:leave', () => ok(null));
    act(() => socket.receive('room:state', lobbySnapshot(3)));

    await user.click(screen.getByRole('button', { name: 'Leave room' }));

    expect(await screen.findByRole('button', { name: 'Create a room' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
  });

  test('waits for the deal once the match has started', () => {
    const { socket } = seated();

    act(() => socket.receive('room:state', roomSnapshot()));

    expect(screen.getByRole('status')).toHaveTextContent('Dealing…');
  });

  test('sends the trump the caller picks', async () => {
    const { socket, user } = seated();
    const game = trumpCallSnapshot();
    socket.respond('game:call-trump', () => ok(null));
    act(() => {
      socket.receive('room:state', roomSnapshot({ youId: `p${game.view.seat}` }));
      socket.receive('game:state', game);
    });

    await user.click(screen.getByRole('button', { name: 'Spades' }));

    expect(socket.requestsOf('game:call-trump')).toEqual([
      { event: 'game:call-trump', payload: [{ seq: game.seq, suit: 'spades' }] },
    ]);
  });

  test('shows the round result between rounds', () => {
    const { socket } = seated();
    const { state } = autoUntil(newMatch(), (each) => each.phase === 'round-scored');

    act(() => {
      socket.receive('room:state', roomSnapshot());
      socket.receive('game:state', snapshotFor(state, 0));
    });

    expect(screen.getByText('Next round')).toBeInTheDocument();
  });

  test('shows the match result at the end and goes home from it', async () => {
    const { socket, user } = seated();
    socket.respond('room:leave', () => ok(null));
    const { state } = autoUntil(newMatch(), (each) => each.phase === 'match-over');
    act(() => {
      socket.receive('room:state', roomSnapshot({ status: 'finished' }));
      socket.receive('game:state', snapshotFor(state, 0, { deadline: null }));
    });

    await user.click(screen.getByRole('button', { name: 'Back to home' }));

    expect(await screen.findByRole('button', { name: 'Create a room' })).toBeInTheDocument();
  });
});

describe('notices', () => {
  const atTable = () => {
    saveSession('KXT4P9', SESSION);
    const opened = open('/r/KXT4P9');
    opened.socket.respond('room:resume', () => ok({ code: 'KXT4P9', playerId: 'p0' }));
    const game = playingSnapshot(1);
    act(() => {
      opened.socket.goOnline();
      opened.socket.receive('room:state', roomSnapshot({ youId: `p${game.view.seat}` }));
      opened.socket.receive('game:state', game);
    });
    return opened;
  };

  test('says the seat is being held when the connection drops, and clears on return', async () => {
    const { socket } = atTable();

    act(() => socket.goOffline());
    expect(screen.getByRole('status', { name: 'Reconnecting' })).toBeInTheDocument();
    expect(screen.getByText('Seat held for')).toBeInTheDocument();

    act(() => socket.goOnline());
    expect(screen.queryByRole('status', { name: 'Reconnecting' })).not.toBeInTheDocument();
  });

  test('offers to bring the seat back when another tab takes it', async () => {
    const { socket, user } = atTable();
    const before = socket.requestsOf('room:resume').length;

    act(() => socket.receive('session:replaced', 'resumed-elsewhere'));
    await user.click(await screen.findByRole('button', { name: 'Play here instead' }));

    expect(socket.requestsOf('room:resume')).toHaveLength(before + 1);
  });

  test('explains a removal by the host and returns home', async () => {
    const { socket, user } = atTable();

    act(() => socket.receive('room:closed', 'kicked'));
    expect(screen.getByRole('alertdialog', { name: 'The host removed you' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back to home' }));
    expect(await screen.findByRole('button', { name: 'Create a room' })).toBeInTheDocument();
    expect(loadSession('KXT4P9')).toBeNull();
  });

  test('explains an expired room', () => {
    const { socket } = atTable();

    act(() => socket.receive('room:closed', 'expired'));

    expect(screen.getByRole('alertdialog', { name: 'This room has closed' })).toBeInTheDocument();
  });
});
