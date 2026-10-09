import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { LobbyScreen } from '../src/lobby/LobbyScreen';
import { failed, ok } from './fakeSocket';
import { SERVER_NOW, lobbySnapshot, withPlayer } from './fixtures';

const setup = (room = lobbySnapshot(3), props: Partial<Parameters<typeof LobbyScreen>[0]> = {}) => {
  const onStart = vi.fn(async () => ok(null));
  const onKick = vi.fn(async () => ok(null));
  const onLeave = vi.fn();
  const user = userEvent.setup();
  render(
    <LobbyScreen room={room} onStart={onStart} onKick={onKick} onLeave={onLeave} {...props} />,
  );
  return { onStart, onKick, onLeave, user };
};

describe('LobbyScreen', () => {
  test('shows the room code and how many players are in', () => {
    setup();

    expect(screen.getByText('KXT4P9')).toBeInTheDocument();
    expect(screen.getByText('3 of 4')).toBeInTheDocument();
    expect(screen.getByText('Waiting for one more player')).toBeInTheDocument();
  });

  test('lists every player and marks the viewer and the host', () => {
    setup();

    const rows = screen.getAllByRole('listitem');
    expect(within(rows[0] as HTMLElement).getByText('Ruwan')).toBeInTheDocument();
    expect(within(rows[0] as HTMLElement).getByText('You · host')).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText('Kamala')).toBeInTheDocument();
  });

  test('says how many are still needed when more than one seat is open', () => {
    setup(lobbySnapshot(2));

    expect(screen.getByText('Waiting for 2 more players')).toBeInTheDocument();
  });

  describe('for the host', () => {
    test('keeps Start disabled until four players are in', () => {
      setup();

      expect(screen.getByRole('button', { name: 'Start match' })).toBeDisabled();
      expect(screen.getByText('Needs 4 players')).toBeInTheDocument();
    });

    test('starts the match once the room is full', async () => {
      const { onStart, user } = setup(lobbySnapshot(4));

      await user.click(screen.getByRole('button', { name: 'Start match' }));

      expect(onStart).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('Needs 4 players')).not.toBeInTheDocument();
    });

    test('can remove any other player, but not themselves', async () => {
      const { onKick, user } = setup();

      await user.click(screen.getByRole('button', { name: 'Remove Kamala' }));

      expect(onKick).toHaveBeenCalledWith('p1');
      expect(screen.queryByRole('button', { name: 'Remove Ruwan' })).not.toBeInTheDocument();
    });

    test('shows the server’s reason when an action is refused', async () => {
      const onStart = vi.fn(async () => failed('not-enough-players'));
      const { user } = setup(lobbySnapshot(4), { onStart });

      await user.click(screen.getByRole('button', { name: 'Start match' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('not-enough-players');
    });
  });

  describe('for a guest', () => {
    test('has no Start or Remove buttons', () => {
      setup(lobbySnapshot(3, 'p1'));

      expect(screen.queryByRole('button', { name: 'Start match' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent(
        'The host starts when four players are in',
      );
    });

    test('is told to wait for the host once the room is full', () => {
      setup(lobbySnapshot(4, 'p2'));

      expect(screen.getByRole('status')).toHaveTextContent('Waiting for the host to start');
    });

    test('sees who the host is', () => {
      setup(lobbySnapshot(3, 'p1'));

      expect(screen.getByText('Host')).toBeInTheDocument();
      expect(screen.getByText('You')).toBeInTheDocument();
    });
  });

  describe('when a player’s connection has dropped', () => {
    /** Nimal (p2) is away with 24 seconds of their place left. */
    const withNimalAway = (youId = 'p0') =>
      withPlayer(lobbySnapshot(4, youId), 'p2', {
        isConnected: false,
        holdDeadline: SERVER_NOW + 24_000,
      });
    const atServerNow = { clockOffset: SERVER_NOW - Date.now() };

    test('shows them as away, with the time their place is held', () => {
      setup(withNimalAway(), atServerNow);

      const row = screen.getByText('Nimal').closest('li') as HTMLElement;
      expect(within(row).getByText(/^away 0:2\d$/)).toBeInTheDocument();
      expect(screen.getByText('4 of 4')).toBeInTheDocument();
    });

    test('the host cannot start, is told why, and can still remove them', async () => {
      const { onStart, onKick, user } = setup(withNimalAway(), atServerNow);

      expect(screen.getByRole('button', { name: 'Start match' })).toBeDisabled();
      expect(screen.getByText('Nimal is away. Wait, or remove them.')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Remove Nimal' }));

      expect(onStart).not.toHaveBeenCalled();
      expect(onKick).toHaveBeenCalledWith('p2');
    });

    test('a guest is told who is being waited for', () => {
      setup(withNimalAway('p1'), atServerNow);

      expect(screen.getByRole('status')).toHaveTextContent('Waiting for Nimal to reconnect');
    });

    test('nobody is shown as away when everyone is connected', () => {
      setup(lobbySnapshot(4));

      expect(screen.queryByText(/^away/)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Start match' })).toBeEnabled();
    });
  });

  test('leaves the room', async () => {
    const { onLeave, user } = setup();

    await user.click(screen.getByRole('button', { name: 'Leave room' }));

    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  test('copies the room link and says so', async () => {
    const { user } = setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();

    await user.click(screen.getByRole('button', { name: 'Copy link' }));

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/r/KXT4P9`);
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  test('says so when the link cannot be copied', async () => {
    const { user } = setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));

    await user.click(screen.getByRole('button', { name: 'Copy link' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not copy');
  });

  test('shows a hostile player name as plain text', () => {
    const room = withPlayer(lobbySnapshot(3), 'p1', { name: '<img src=x onerror=alert(1)>' });

    setup(room);

    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });
});
