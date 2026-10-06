import type { Seat } from '@omi/engine';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cardName } from '../src/cards/cardNames';
import { TableScreen } from '../src/table/TableScreen';
import { ok } from './fakeSocket';
import {
  SERVER_NOW,
  playingSnapshot,
  roomSnapshot,
  trumpCallSnapshot,
  withPlayer,
} from './fixtures';

const renderWide = (
  game = playingSnapshot(1),
  room = roomSnapshot({ youId: `p${game.view.seat}` }),
) => {
  const onPlayCard = vi.fn(async () => ok(null));
  const onCallTrump = vi.fn(async () => ok(null));
  render(
    <TableScreen
      room={room}
      game={game}
      clockOffset={SERVER_NOW - Date.now()}
      onCallTrump={onCallTrump}
      onPlayCard={onPlayCard}
      onLeave={vi.fn()}
    />,
  );
  return { game, onPlayCard, onCallTrump, user: userEvent.setup() };
};

beforeEach(() => {
  // jsdom has no matchMedia; report a desktop-width window.
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the table on a wide window', () => {
  test('shows the room, the tokens and the players in a side panel', () => {
    const { game } = renderWide();

    const panel = screen.getByRole('complementary', { name: 'Match' });
    expect(within(panel).getByRole('heading', { name: 'Your turn' })).toBeInTheDocument();
    expect(
      within(panel).getByRole('heading', { name: 'Tokens · first to 10' }),
    ).toBeInTheDocument();
    expect(within(panel).getByRole('heading', { name: 'Players' })).toBeInTheDocument();
    expect(screen.getByText(`Room KXT4P9 · Round ${game.view.roundNumber}`)).toBeInTheDocument();
  });

  test('lists all four players, marking the viewer, their partner and whose turn it is', () => {
    const { game } = renderWide();
    const me = roomSnapshot().players[game.view.seat]?.name;
    const partner = roomSnapshot().players[(game.view.seat + 2) % 4]?.name;

    const rows = within(screen.getByRole('complementary')).getAllByRole('listitem');

    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveTextContent(`${me} (you)`);
    expect(rows[0]).toHaveTextContent('to play');
    expect(rows[1]).toHaveTextContent(`${partner}`);
  });

  test('says when a bot will take an away player’s seat', () => {
    const game = playingSnapshot(1);
    const left = ((game.view.seat + 3) % 4) as Seat;
    const room = withPlayer(roomSnapshot({ youId: `p${game.view.seat}` }), `p${left}`, {
      isConnected: false,
      holdDeadline: SERVER_NOW + 41_000,
    });

    renderWide(game, room);

    expect(screen.getByText('away · bot in 0:41')).toBeInTheDocument();
  });

  test('keeps the hand playable, on the table', async () => {
    const { game, onPlayCard, user } = renderWide();
    const card = game.view.legalMoves[0];
    if (!card) throw new Error('No legal card');
    const hand = screen.getByRole('list', { name: 'Your hand' });

    await user.click(within(hand).getByRole('button', { name: `${cardName(card)}, playable` }));

    expect(onPlayCard).toHaveBeenCalledWith(card);
    expect(screen.getByRole('complementary')).not.toContainElement(hand);
  });

  test('puts the trump choice in the side panel for the caller', async () => {
    const { onCallTrump, user } = renderWide(trumpCallSnapshot());

    const panel = screen.getByRole('complementary');
    await user.click(within(panel).getByRole('button', { name: 'Clubs' }));

    expect(onCallTrump).toHaveBeenCalledWith('clubs');
  });
});
