import type { Ack } from '@omi/protocol';
import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createConnection } from '../src/net/connection';
import { loadSession, saveSession } from '../src/net/session';
import { ReconnectingNotice, ReplacedNotice } from '../src/notices/Notices';
import { useGame } from '../src/state/useGame';
import { TableScreen } from '../src/table/TableScreen';
import { FakeSocket, failed, ok } from './fakeSocket';
import { SERVER_NOW, auto, newMatch, roomSnapshot, snapshotFor } from './fixtures';

const SESSION = { code: 'KXT4P9', playerId: 'p0', token: 't'.repeat(43) };
const RESUMED = ok({ code: 'KXT4P9', playerId: 'p0' });

const setup = (
  path = '/r/KXT4P9',
  wrapper?: ({ children }: { children: ReactNode }) => ReactNode,
) => {
  window.history.replaceState(null, '', path);
  const socket = new FakeSocket();
  const connection = createConnection(socket);
  const hook = renderHook(() => useGame(connection), wrapper ? { wrapper } : undefined);
  return { socket, ...hook };
};

/** Lets pending promise callbacks run inside act. */
const settle = () => act(async () => undefined);

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  saveSession('KXT4P9', SESSION);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('a resume that fails for a passing reason', () => {
  test('keeps the saved seat and tries again', async () => {
    vi.useFakeTimers();
    const { socket, result } = setup();
    const answers = [failed('rate-limited'), RESUMED];
    socket.respond('room:resume', () => answers.shift() ?? RESUMED);

    act(() => socket.goOnline());
    await settle();
    expect(loadSession('KXT4P9')).not.toBeNull();
    expect(result.current.isResuming).toBe(true);

    await act(() => vi.advanceTimersByTimeAsync(3000));

    expect(socket.requestsOf('room:resume')).toHaveLength(2);
    expect(result.current.isResuming).toBe(false);
    expect(loadSession('KXT4P9')).not.toBeNull();
  });

  test('keeps the saved seat when the server does not answer at all', async () => {
    const { socket } = setup();

    act(() => socket.goOnline());
    await settle();

    expect(socket.requestsOf('room:resume')).toHaveLength(1);
    expect(loadSession('KXT4P9')).not.toBeNull();
  });
});

describe('a resume answered after the connection changed', () => {
  test('cannot wipe the seat a newer resume restored', async () => {
    const { socket } = setup();
    let answerFirst: (ack: Ack<unknown>) => void = () => undefined;
    const answers: (() => Ack<unknown> | Promise<Ack<unknown>>)[] = [
      () => new Promise((resolve) => (answerFirst = resolve)),
      () => RESUMED,
    ];
    socket.respond('room:resume', () => (answers.shift() ?? (() => RESUMED))());

    act(() => socket.goOnline());
    act(() => socket.goOffline());
    act(() => socket.goOnline());
    await settle();
    answerFirst(failed('session-invalid'));
    await settle();

    expect(socket.requestsOf('room:resume')).toHaveLength(2);
    expect(loadSession('KXT4P9')).not.toBeNull();
  });
});

describe('a seat the server no longer knows', () => {
  test('clears the old table from the screen as well as the saved seat', async () => {
    const { socket, result } = setup();
    const answers = [RESUMED, failed('session-invalid')];
    socket.respond('room:resume', () => answers.shift() ?? failed('session-invalid'));
    act(() => socket.goOnline());
    await settle();
    act(() => socket.receive('room:state', roomSnapshot()));
    expect(result.current.state.room).not.toBeNull();

    act(() => socket.goOffline());
    act(() => socket.goOnline());
    await settle();

    expect(result.current.state.room).toBeNull();
    expect(result.current.state.offlineSince).toBeNull();
    expect(loadSession('KXT4P9')).toBeNull();
  });
});

describe('a tab whose seat was taken by another tab', () => {
  test('does not take the seat back by itself when it reconnects', async () => {
    const { socket } = setup();
    socket.respond('room:resume', () => RESUMED);
    act(() => socket.goOnline());
    await settle();
    act(() => socket.receive('room:state', roomSnapshot()));
    act(() => socket.receive('session:replaced', 'resumed-elsewhere'));
    const before = socket.requestsOf('room:resume').length;

    act(() => socket.goOffline());
    act(() => socket.goOnline());
    await settle();

    expect(socket.requestsOf('room:resume')).toHaveLength(before);
  });
});

describe('under StrictMode', () => {
  test('reclaims the seat without looping and finishes resuming', async () => {
    const { socket, result } = setup('/r/KXT4P9', ({ children }) => (
      <StrictMode>{children}</StrictMode>
    ));
    socket.respond('room:resume', () => RESUMED);

    act(() => socket.goOnline());
    await settle();
    await settle();

    const resumes = socket.requestsOf('room:resume').length;
    expect(resumes).toBeGreaterThanOrEqual(1);
    expect(resumes).toBeLessThanOrEqual(2);
    expect(result.current.isResuming).toBe(false);
    expect(loadSession('KXT4P9')).not.toBeNull();
  });
});

describe('moving away from a room', () => {
  test('the Back button gives the seat up and clears the room', async () => {
    const { socket, result } = setup();
    socket.respond('room:resume', () => RESUMED);
    socket.respond('room:leave', () => ok(null));
    act(() => socket.goOnline());
    await settle();
    act(() => socket.receive('room:state', roomSnapshot()));

    act(() => {
      window.history.replaceState(null, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await settle();

    expect(socket.requestsOf('room:leave')).toHaveLength(1);
    expect(result.current.state.room).toBeNull();
    expect(result.current.route).toEqual({ name: 'home' });
  });

  test('leaving with no answer from the server keeps the saved seat', async () => {
    const { socket, result } = setup();
    socket.respond('room:resume', () => RESUMED);
    act(() => socket.goOnline());
    await settle();
    act(() => socket.receive('room:state', roomSnapshot()));

    await act(() => result.current.leaveRoom());

    expect(loadSession('KXT4P9')).not.toBeNull();
    expect(result.current.route).toEqual({ name: 'home' });
  });
});

describe('a won trick on the table', () => {
  const wonAndNext = () => {
    let step = auto(newMatch());
    while (!step.events.some((event) => event.type === 'trick-won')) step = auto(step.state);
    const next = auto(step.state);
    const seat = 0 as const;
    return {
      won: snapshotFor(step.state, seat, { events: step.events, seq: 5 }),
      next: snapshotFor(next.state, seat, { events: next.events, seq: 6 }),
    };
  };

  const table = (game: ReturnType<typeof wonAndNext>['won']) => (
    <TableScreen
      room={roomSnapshot()}
      game={game}
      clockOffset={SERVER_NOW - Date.now()}
      onCallTrump={vi.fn(async () => ok(null))}
      onPlayCard={vi.fn(async () => ok(null))}
      onLeave={vi.fn()}
    />
  );

  test('stays for its full time even when the next card arrives sooner', () => {
    vi.useFakeTimers();
    const { won, next } = wonAndNext();
    const { rerender } = render(table(won));

    act(() => vi.advanceTimersByTime(1000));
    rerender(table(next));

    expect(screen.getByRole('heading', { name: /took the trick/ })).toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: /(led|played) by/ })).toHaveLength(4);

    act(() => vi.advanceTimersByTime(600));

    expect(screen.queryByRole('heading', { name: /took the trick/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: /(led|played) by/ })).toHaveLength(1);
  });

  test('is not shown again when the same state is sent twice', () => {
    vi.useFakeTimers();
    const { won } = wonAndNext();
    const { rerender } = render(table(won));
    act(() => vi.advanceTimersByTime(1600));

    rerender(table({ ...won }));

    expect(screen.queryByRole('heading', { name: /took the trick/ })).not.toBeInTheDocument();
  });
});

describe('a refused move', () => {
  test('is forgotten once the game moves on', async () => {
    const acting = auto(auto(newMatch()).state).state;
    const seat = acting.turn ?? 0;
    const game = snapshotFor(acting, seat, { seq: 2 });
    const props = {
      room: roomSnapshot({ youId: `p${seat}` }),
      clockOffset: 0,
      onCallTrump: vi.fn(async () => ok(null)),
      onPlayCard: vi.fn(async () => failed('stale-action')),
      onLeave: vi.fn(),
    };
    const { rerender } = render(<TableScreen {...props} game={game} />);

    await userEvent.click(screen.getAllByRole('button', { name: /, playable$/ })[0] as HTMLElement);
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    rerender(<TableScreen {...props} game={{ ...game, seq: 3 }} />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('notices and assistive technology', () => {
  test('the reconnecting clock is kept out of the spoken status', () => {
    render(<ReconnectingNotice offlineSince={Date.now()} holdSeconds={60} />);

    const clock = screen.getByText('Seat held for').closest('.dialog__hold');

    expect(clock).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('status', { name: 'Reconnecting' })).toBeInTheDocument();
  });

  test('says a bot is playing once the hold has run out', () => {
    render(<ReconnectingNotice offlineSince={Date.now() - 61_000} holdSeconds={60} />);

    expect(screen.getByText(/A bot is playing your seat/)).toBeInTheDocument();
    expect(screen.queryByText('Seat held for')).not.toBeInTheDocument();
  });

  test('the take-back button keeps focus while its request is in flight', async () => {
    let finish: (ack: Ack<unknown>) => void = () => undefined;
    const onPlayHere = vi.fn(() => new Promise<Ack<unknown>>((resolve) => (finish = resolve)));
    render(<ReplacedNotice onPlayHere={onPlayHere} />);
    const button = screen.getByRole('button', { name: 'Play here instead' });

    await userEvent.click(button);
    await userEvent.click(button);

    expect(button).toHaveFocus();
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(onPlayHere).toHaveBeenCalledTimes(1);

    await act(async () => finish(failed('session-invalid')));
    expect(screen.getByRole('alert')).toHaveTextContent('session-invalid');
    expect(button).toHaveFocus();
  });
});
