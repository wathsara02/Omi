import type { GameState, Seat } from '@omi/engine';
import type { GameSnapshot, RoomSnapshot } from '@omi/protocol';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { cardName } from '../src/cards/cardNames';
import { TableScreen } from '../src/table/TableScreen';
import { handCardState, sortHand, tableStatus } from '../src/table/tableStatus';
import { failed, ok } from './fakeSocket';
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

const setup = (
  game: GameSnapshot,
  room: RoomSnapshot = roomSnapshot({ youId: `p${game.view.seat}` }),
  props: Partial<Parameters<typeof TableScreen>[0]> = {},
) => {
  const onCallTrump = vi.fn(async () => ok(null));
  const onPlayCard = vi.fn(async () => ok(null));
  const onLeave = vi.fn();
  const user = userEvent.setup();
  const view = render(
    <TableScreen
      room={room}
      game={game}
      clockOffset={SERVER_NOW - Date.now()}
      onCallTrump={onCallTrump}
      onPlayCard={onPlayCard}
      onLeave={onLeave}
      {...props}
    />,
  );
  return { onCallTrump, onPlayCard, onLeave, user, ...view };
};

/** Plays automatically until a trick has just been won mid-round; returns that step. */
const afterFirstTrick = (): { state: GameState; snapshot: (seat: Seat) => GameSnapshot } => {
  let step = auto(newMatch());
  while (!step.events.some((event) => event.type === 'trick-won')) step = auto(step.state);
  const { state, events } = step;
  return { state, snapshot: (seat) => snapshotFor(state, seat, { events, seq: 5 }) };
};

afterEach(() => {
  vi.useRealTimers();
});

describe('calling trump', () => {
  test('offers the four suits to the caller, with their first four cards', () => {
    const game = trumpCallSnapshot();
    setup(game);

    expect(screen.getByRole('heading', { name: 'Name trump' })).toBeInTheDocument();
    const suits = within(screen.getByRole('group', { name: 'Choose trump' })).getAllByRole(
      'button',
    );
    expect(suits.map((suit) => suit.textContent)).toEqual([
      'Hearts',
      'Spades',
      'Diamonds',
      'Clubs',
    ]);
    expect(within(screen.getByRole('list')).getAllByRole('img')).toHaveLength(4);
  });

  test('sends the chosen suit', async () => {
    const { onCallTrump, user } = setup(trumpCallSnapshot());

    await user.click(screen.getByRole('button', { name: 'Diamonds' }));

    expect(onCallTrump).toHaveBeenCalledWith('diamonds');
  });

  test('shows other players who is calling, with no suit buttons', () => {
    const state = newMatch();
    const watcher = ((state.caller + 1) % 4) as Seat;
    setup(snapshotFor(state, watcher));

    const callerName = roomSnapshot().players[state.caller]?.name;
    expect(
      screen.getByRole('heading', { name: `${callerName} is naming trump` }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Choose trump' })).not.toBeInTheDocument();
  });

  test('says no trump has been called yet', () => {
    setup(trumpCallSnapshot());

    expect(screen.getByText(/no trump yet/)).toBeInTheDocument();
  });
});

describe('the player’s turn', () => {
  test('makes exactly the legal cards playable and dims the rest', () => {
    const game = playingSnapshot(1);
    setup(game);

    const playable = screen.getAllByRole('button', { name: /, playable$/ });
    const dimmed = screen.queryAllByRole('button', { name: /, not playable$/ });

    expect(playable).toHaveLength(game.view.legalMoves.length);
    expect(playable.length + dimmed.length).toBe(game.view.hand.length);
    for (const card of game.view.legalMoves) {
      expect(screen.getByRole('button', { name: `${cardName(card)}, playable` })).toBeEnabled();
    }
  });

  test('plays the card that is pressed', async () => {
    const game = playingSnapshot(1);
    const { onPlayCard, user } = setup(game);
    const card = game.view.legalMoves[0];
    if (!card) throw new Error('No legal card');

    await user.click(screen.getByRole('button', { name: `${cardName(card)}, playable` }));

    expect(onPlayCard).toHaveBeenCalledWith(card);
  });

  test('says it is the player’s turn and shows where their card will go', () => {
    setup(playingSnapshot(1));

    expect(screen.getByRole('heading', { name: 'Your turn' })).toBeInTheDocument();
    expect(screen.getByText('Your card')).toBeInTheDocument();
    expect(screen.getByRole('timer')).toBeInTheDocument();
  });

  test('shows the server’s reason when a move is refused', async () => {
    const game = playingSnapshot(1);
    const onPlayCard = vi.fn(async () => failed('stale-action'));
    const { user } = setup(game, undefined, { onPlayCard });

    await user.click(screen.getAllByRole('button', { name: /, playable$/ })[0] as HTMLElement);

    expect(await screen.findByRole('alert')).toHaveTextContent('stale-action');
  });

  test('shows the trump suit', () => {
    const game = playingSnapshot(1);
    setup(game);

    expect(screen.getByText('Trump')).toBeInTheDocument();
    expect(game.view.trump).not.toBeNull();
  });
});

describe('another player’s turn', () => {
  const watching = (): { game: GameSnapshot; onTurn: Seat } => {
    const acting = playingSnapshot(1);
    const onTurn = acting.view.seat;
    const watcher = ((onTurn + 1) % 4) as Seat;
    const state = auto(auto(newMatch()).state).state;
    return { game: snapshotFor(state, watcher), onTurn };
  };

  test('names whose turn it is and offers no playable cards', () => {
    const { game, onTurn } = watching();
    setup(game);

    const name = roomSnapshot().players[onTurn]?.name;
    expect(screen.getByRole('heading', { name: `${name}’s turn` })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /, playable$/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Your card')).not.toBeInTheDocument();
  });

  test('shows the cards already played, with who played them', () => {
    const { game } = watching();
    setup(game);

    const played = game.view.currentTrick?.plays ?? [];
    expect(played.length).toBeGreaterThan(0);
    expect(screen.getAllByRole('img', { name: /(led|played) by/ })).toHaveLength(played.length);
  });

  test('marks a disconnected player as away with the time left, and a bot as a bot', () => {
    const { game, onTurn } = watching();
    const partnerSeat = ((game.view.seat + 2) % 4) as Seat;
    const room = withPlayer(
      withPlayer(roomSnapshot({ youId: `p${game.view.seat}` }), `p${onTurn}`, {
        isConnected: false,
        holdDeadline: SERVER_NOW + 41_000,
      }),
      `p${partnerSeat}`,
      { isConnected: false, isBot: true },
    );
    setup(game, room);

    expect(screen.getByText('away 0:41')).toBeInTheDocument();
    expect(screen.getByText('bot')).toBeInTheDocument();
    expect(screen.getByText('They are away. The turn timer still runs.')).toBeInTheDocument();
  });

  test('labels the partner and the dealer', () => {
    const { game } = watching();
    setup(game);

    expect(screen.getByText(/partner/)).toBeInTheDocument();
    if (game.view.dealer !== game.view.seat) {
      expect(screen.getByText(/dealer/)).toBeInTheDocument();
    }
  });
});

describe('a trick that has just been won', () => {
  test('keeps the four cards on the table with the winner ringed, then moves on', () => {
    vi.useFakeTimers();
    const { state, snapshot } = afterFirstTrick();
    const winner = state.previousTrick?.winner as Seat;
    const watcher = ((winner + 1) % 4) as Seat;
    setup(snapshot(watcher));

    const winnerName = roomSnapshot().players[winner]?.name;
    expect(
      screen.getByRole('heading', { name: `${winnerName} took the trick` }),
    ).toBeInTheDocument();
    const shown = screen.getAllByRole('img', { name: /(led|played) by/ });
    expect(shown).toHaveLength(4);
    expect(shown.filter((card) => card.classList.contains('card--winner'))).toHaveLength(1);

    act(() => vi.advanceTimersByTime(1600));

    expect(screen.queryAllByRole('img', { name: /(led|played) by/ })).toHaveLength(0);
    expect(screen.getByRole('heading', { name: `${winnerName}’s turn` })).toBeInTheDocument();
  });

  test('tells the winner they lead next', () => {
    const { state, snapshot } = afterFirstTrick();
    const winner = state.previousTrick?.winner as Seat;
    setup(snapshot(winner));

    expect(screen.getByRole('heading', { name: 'You took the trick' })).toBeInTheDocument();
    expect(screen.getByText('You lead next.')).toBeInTheDocument();
  });
});

describe('leaving', () => {
  test('is offered from the table', async () => {
    const { onLeave, user } = setup(playingSnapshot(1));

    await user.click(screen.getByRole('button', { name: 'Leave match' }));

    expect(onLeave).toHaveBeenCalledTimes(1);
  });
});

describe('table helpers', () => {
  test('sortHand groups by suit with the highest card first, without changing the input', () => {
    const hand = [
      { suit: 'diamonds', rank: '7' },
      { suit: 'spades', rank: '9' },
      { suit: 'hearts', rank: 'A' },
      { suit: 'spades', rank: 'K' },
    ] as const;

    expect(sortHand(hand).map(cardName)).toEqual([
      'King of spades',
      'Nine of spades',
      'Ace of hearts',
      'Seven of diamonds',
    ]);
    expect(hand[0]).toEqual({ suit: 'diamonds', rank: '7' });
  });

  test('handCardState leaves cards idle when it is not the player’s turn', () => {
    const { view } = trumpCallSnapshot();
    const [card] = view.hand;
    if (!card) throw new Error('Empty hand');

    expect(handCardState(view, card)).toBe('idle');
  });

  test('tableStatus tells a player who must follow suit which suit', () => {
    const game = playingSnapshot(1);
    const ledSuit = game.view.currentTrick?.plays[0]?.card.suit;
    const status = tableStatus(game.view, roomSnapshot(), null);

    expect(status.title).toBe('Your turn');
    expect(status.hint.toLowerCase()).toContain(ledSuit as string);
  });

  test('tableStatus tells the leader they may play anything', () => {
    const leading = auto(newMatch()).state;
    const view = snapshotFor(leading, leading.turn as Seat).view;

    expect(tableStatus(view, roomSnapshot(), null).hint).toBe('You lead. Play any card.');
  });
});
