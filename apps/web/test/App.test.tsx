import { seedFromInteger } from '@omi/engine';
import { act, render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { App } from '../src/App';
import { createConnection } from '../src/net/connection';
import { loadSession, saveSession } from '../src/net/session';
import { FakeSocket, failed, ok } from './fakeSocket';
import {
  apply,
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

  // A state that arrives with no events is a reload or a reconnect: nothing is replayed.
  test('shows the round result between rounds', () => {
    const { socket } = seated();
    const { state } = autoUntil(newMatch(), (each) => each.phase === 'round-scored');

    act(() => {
      socket.receive('room:state', roomSnapshot());
      socket.receive('game:state', snapshotFor(state, 0));
    });

    expect(screen.getByText('Next round')).toBeInTheDocument();
  });

  /** The server sends the final state, then the room as the lobby it has become. */
  const endMatch = (socket: FakeSocket): void => {
    const { state } = autoUntil(newMatch(), (each) => each.phase === 'match-over');
    act(() => {
      socket.receive('room:state', roomSnapshot());
      socket.receive('game:state', snapshotFor(state, 0, { deadline: null }));
      socket.receive('room:state', lobbySnapshot(4));
    });
  };

  test('keeps the match result on screen after the room has gone back to the lobby', () => {
    const { socket } = seated();

    endMatch(socket);

    expect(screen.getByRole('heading', { name: /the match$/ })).toBeInTheDocument();
    expect(screen.getByText('You and Nimal')).toBeInTheDocument();
  });

  test('goes from the match result back to the lobby, where the host can start again', async () => {
    const { socket, user } = seated();
    socket.respond('room:start', () => ok(null));
    endMatch(socket);

    await user.click(screen.getByRole('button', { name: 'Back to lobby' }));
    expect(screen.getByRole('heading', { name: 'Players' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /start/i }));
    expect(socket.requestsOf('room:start')).toHaveLength(1);
  });

  test('goes straight to the table if the host starts while the result is still showing', () => {
    const { socket } = seated();
    endMatch(socket);
    const next = playingSnapshot(1);

    act(() => {
      socket.receive('room:state', roomSnapshot({ youId: `p${next.view.seat}` }));
      socket.receive('game:state', { ...next, seq: 90 });
    });

    expect(screen.getByRole('heading', { name: 'Your turn' })).toBeInTheDocument();
  });

  test('can leave the room from the match result', async () => {
    const { socket, user } = seated();
    socket.respond('room:leave', () => ok(null));
    endMatch(socket);

    await user.click(screen.getByRole('button', { name: 'Leave room' }));

    expect(await screen.findByRole('button', { name: 'Create a room' })).toBeInTheDocument();
  });
});

describe('when a round ends while the player is watching', () => {
  const TRICK_SHOWN_MS = 1600;
  const FINAL_RESULT_MS = 5000;

  /** Delivers the state that ended a round or the match, with the events that came with it. */
  const endWith = (phase: 'round-scored' | 'match-over') => {
    vi.useFakeTimers();
    const { socket } = open('/r/KXT4P9');
    const step = autoUntil(newMatch(), (each) => each.phase === phase);
    const isOver = phase === 'match-over';
    act(() => {
      socket.goOnline();
      socket.receive('room:state', roomSnapshot());
      socket.receive(
        'game:state',
        snapshotFor(step.state, 0, {
          events: step.events,
          seq: 40,
          ...(isOver ? { deadline: null } : {}),
        }),
      );
      // After the last round the room is a lobby again straight away.
      if (isOver) socket.receive('room:state', lobbySnapshot(4));
    });
    return { socket, state: step.state };
  };

  afterEach(() => {
    vi.useRealTimers();
  });

  test('keeps the last trick on the table, then shows the round result', () => {
    endWith('round-scored');

    expect(screen.getByRole('heading', { name: /took the trick$/ })).toBeInTheDocument();
    expect(screen.queryByText('Next round')).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(TRICK_SHOWN_MS));

    expect(screen.getByText('Next round')).toBeInTheDocument();
  });

  test('shows the winning trick, then the last round’s result, then the match result', () => {
    endWith('match-over');

    expect(screen.getByRole('heading', { name: /took the trick$/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /the match$/ })).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(TRICK_SHOWN_MS));

    expect(screen.getByRole('timer', { name: /^Match result in/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/the round|Kapothi/);
    expect(screen.queryByRole('heading', { name: /the match$/ })).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(FINAL_RESULT_MS));

    expect(screen.getByRole('heading', { name: /the match$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to lobby' })).toBeInTheDocument();
  });

  test('the match result can be reached at once from the last round’s result', () => {
    endWith('match-over');
    act(() => vi.advanceTimersByTime(TRICK_SHOWN_MS));

    fireEvent.click(screen.getByRole('button', { name: 'See match result' }));

    expect(screen.getByRole('heading', { name: /the match$/ })).toBeInTheDocument();
    // The timer that would have done the same must not undo anything later.
    act(() => vi.advanceTimersByTime(FINAL_RESULT_MS));
    expect(screen.getByRole('button', { name: 'Back to lobby' })).toBeInTheDocument();
  });

  test('a later state for the finished match does not cut the ending short', () => {
    const { socket, state } = endWith('match-over');
    act(() => vi.advanceTimersByTime(TRICK_SHOWN_MS));

    act(() => socket.receive('game:state', snapshotFor(state, 0, { seq: 41, deadline: null })));

    expect(screen.getByRole('timer', { name: /^Match result in/ })).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(FINAL_RESULT_MS));

    expect(screen.getByRole('heading', { name: /the match$/ })).toBeInTheDocument();
  });

  test('goes to the table as soon as the next round is dealt', () => {
    const { socket, state } = endWith('round-scored');
    const dealt = apply(state, { type: 'next-round', seed: seedFromInteger(7) });

    act(() => socket.receive('game:state', snapshotFor(dealt.state, 0, { seq: 41 })));

    expect(screen.queryByRole('heading', { name: /took the trick$/ })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /nam(e|ing) trump$/i })).toBeInTheDocument();
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
    expect(screen.getByRole('status', { name: 'Reconnecting' })).toBeInTheDocument();

    act(() => socket.receive('room:state', roomSnapshot()));
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
