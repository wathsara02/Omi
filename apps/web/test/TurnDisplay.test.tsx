import type { Seat } from '@omi/engine';
import type { GameSnapshot, RoomSnapshot } from '@omi/protocol';
import { act, render, screen, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { TableScreen } from '../src/table/TableScreen';
import { ok } from './fakeSocket';
import {
  SERVER_NOW,
  auto,
  newMatch,
  playingSnapshot,
  roomSnapshot,
  snapshotFor,
  trumpCallSnapshot,
  withPlayer,
} from './fixtures';

const RING = { name: 'Turn timer' } as const;

const show = (
  game: GameSnapshot,
  room: RoomSnapshot = roomSnapshot({ youId: `p${game.view.seat}` }),
) =>
  render(
    <TableScreen
      room={room}
      game={game}
      clockOffset={SERVER_NOW - Date.now()}
      onCallTrump={vi.fn(async () => ok(null))}
      onPlayCard={vi.fn(async () => ok(null))}
      onLeave={vi.fn()}
    />,
  );

const nameAt = (seat: number): string => roomSnapshot().players[seat % 4]?.name ?? '';

/** A game where it is someone else's turn, seen from the seat after theirs. */
const watching = (overrides: Partial<GameSnapshot> = {}) => {
  const state = auto(auto(newMatch()).state).state;
  const onTurn = state.turn as Seat;
  const watcher = ((onTurn + 1) % 4) as Seat;
  return { game: snapshotFor(state, watcher, overrides), onTurn, watcher };
};

describe('the player’s own turn', () => {
  test('shows a "Your turn" banner', () => {
    show(playingSnapshot(1));

    expect(screen.getByText('Your turn', { selector: '.table__banner' })).toBeInTheDocument();
  });

  test('puts the timer ring on the player’s own avatar, with the seconds left inside', () => {
    show(playingSnapshot(1));

    const me = screen.getByRole('group', { name: 'You, to play' });

    expect(within(me).getByRole('img', RING)).toBeInTheDocument();
    expect(within(me).getByText('9')).toBeInTheDocument();
  });

  test('says what to do beside the avatar, and has no timer bar', () => {
    const game = playingSnapshot(1);
    show(game);
    const suit = game.view.currentTrick?.plays[0]?.card.suit as string;

    expect(screen.getByRole('status')).toHaveTextContent(new RegExp(suit, 'i'));
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
  });

  test('gives no other player a ring', () => {
    show(playingSnapshot(1));

    expect(screen.getAllByRole('img', RING)).toHaveLength(1);
  });

  test('keeps the ticking seconds away from screen readers', () => {
    show(playingSnapshot(1));

    const seconds = within(screen.getByRole('group', { name: 'You, to play' })).getByText('9');

    expect(seconds.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Your turn' })).toBeInTheDocument();
  });

  test('shows no ring and no zero once the time is up', () => {
    const game = playingSnapshot(1);
    show({ ...game, deadline: SERVER_NOW - 500 });

    const me = screen.getByRole('group', { name: 'You, to play' });

    expect(within(me).queryByRole('img', RING)).not.toBeInTheDocument();
    expect(within(me).queryByText('0')).not.toBeInTheDocument();
  });

  test('measures the ring against a full turn, not against when the state arrived', () => {
    // 3 seconds left of a 15-second turn, in a state that has only just been sent.
    const game = playingSnapshot(1);
    show({ ...game, deadline: SERVER_NOW + 3000, serverNow: SERVER_NOW });

    const progress = screen.getByRole('img', RING).querySelector('.turn-avatar__progress');
    const [drawn = '0', whole = '1'] = (progress as SVGElement).style.strokeDasharray.split(
      /[ ,]+/,
    );

    expect(Number.parseFloat(drawn) / Number.parseFloat(whole)).toBeCloseTo(0.2, 1);
  });

  test('turns the ring urgent for the last 5 seconds', () => {
    const calm = playingSnapshot(1);
    const { unmount } = show(calm);
    expect(screen.getByRole('img', RING)).not.toHaveClass('turn-avatar__ring--urgent');
    unmount();

    show({ ...calm, deadline: SERVER_NOW + 4000 });

    expect(screen.getByRole('img', RING)).toHaveClass('turn-avatar__ring--urgent');
    expect(screen.getByText('4')).toBeInTheDocument();
  });
});

describe('another player’s turn', () => {
  test('puts the ring and the pulse on that player only, with no seconds shown', () => {
    const { game, onTurn } = watching();
    show(game);

    const seat = screen.getByRole('group', { name: `${nameAt(onTurn)}, to play` });

    expect(within(seat).getByRole('img', RING)).toBeInTheDocument();
    expect(seat.querySelector('.turn-avatar--on-turn')).not.toBeNull();
    expect(screen.getAllByRole('img', RING)).toHaveLength(1);
    expect(within(seat).queryByText('9')).not.toBeInTheDocument();
  });

  test('shows no banner, and the player’s own avatar carries their initial', () => {
    const { game, watcher } = watching();
    show(game);

    const me = screen.getByRole('group', { name: 'You' });

    expect(screen.queryByText('Your turn', { selector: '.table__banner' })).not.toBeInTheDocument();
    expect(within(me).getByText(nameAt(watcher).charAt(0))).toBeInTheDocument();
    expect(within(me).queryByRole('img', RING)).not.toBeInTheDocument();
  });

  test('says whose turn it is beside the player’s avatar', () => {
    const { game, onTurn } = watching();
    show(game);

    expect(screen.getByRole('status')).toHaveTextContent(`${nameAt(onTurn)}’s turn`);
  });

  test('a bot on turn pulses but has no ring, because a bot has no countdown', () => {
    const { game, onTurn } = watching({ deadline: null });
    const room = withPlayer(roomSnapshot({ youId: `p${game.view.seat}` }), `p${onTurn}`, {
      isConnected: false,
      isBot: true,
    });
    show(game, room);

    const seat = screen.getByRole('group', { name: `${nameAt(onTurn)}, to play` });

    expect(seat.querySelector('.turn-avatar--on-turn')).not.toBeNull();
    expect(screen.queryByRole('img', RING)).not.toBeInTheDocument();
  });

  test('an away player on turn keeps the away label and gets no ring', () => {
    const { game, onTurn } = watching();
    const room = withPlayer(roomSnapshot({ youId: `p${game.view.seat}` }), `p${onTurn}`, {
      isConnected: false,
      holdDeadline: SERVER_NOW + 41_000,
    });
    show(game, room);

    const seat = screen.getByRole('group', { name: `${nameAt(onTurn)}, to play` });

    expect(within(seat).getByText('away 0:41')).toBeInTheDocument();
    expect(screen.queryByRole('img', RING)).not.toBeInTheDocument();
  });
});

describe('calling trump', () => {
  test('puts the ring on the caller while everyone waits', () => {
    const state = newMatch();
    const watcher = ((state.caller + 1) % 4) as Seat;
    show(snapshotFor(state, watcher));

    const caller = screen.getByRole('group', { name: `${nameAt(state.caller)}, to play` });

    expect(within(caller).getByRole('img', RING)).toBeInTheDocument();
  });

  test('shows everyone else no banner while the caller decides', () => {
    const state = newMatch();
    const watcher = ((state.caller + 1) % 4) as Seat;
    show(snapshotFor(state, watcher));

    expect(screen.queryByText('Your turn', { selector: '.table__banner' })).not.toBeInTheDocument();
  });

  test('shows the caller the banner and the ring on their own avatar', () => {
    show(trumpCallSnapshot());

    expect(screen.getByText('Your turn', { selector: '.table__banner' })).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'You, to play' })).getByRole('img', RING),
    ).toBeInTheDocument();
  });
});

describe('while a won trick is on the table', () => {
  test('gives the next player no ring until the trick is cleared, then shows it', () => {
    vi.useFakeTimers();
    let step = auto(newMatch());
    while (!step.events.some((event) => event.type === 'trick-won')) step = auto(step.state);
    const winner = step.state.previousTrick?.winner as Seat;
    const watcher = ((winner + 1) % 4) as Seat;
    show(snapshotFor(step.state, watcher, { events: step.events, seq: 5 }));

    expect(screen.queryByRole('img', RING)).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1600));

    const next = screen.getByRole('group', { name: `${nameAt(winner)}, to play` });
    expect(within(next).getByRole('img', RING)).toBeInTheDocument();
    vi.useRealTimers();
  });

  test('shows no ring and no banner', () => {
    let step = auto(newMatch());
    while (!step.events.some((event) => event.type === 'trick-won')) step = auto(step.state);
    const winner = step.state.previousTrick?.winner as Seat;
    show(snapshotFor(step.state, winner, { events: step.events, seq: 5 }));

    expect(screen.queryByRole('img', RING)).not.toBeInTheDocument();
    expect(screen.queryByText('Your turn', { selector: '.table__banner' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('You took the trick');
  });
});

describe('one layout for every screen size', () => {
  test('has no side panel or players list', () => {
    show(playingSnapshot(1));

    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Players' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('list')).toHaveLength(1);
  });
});
