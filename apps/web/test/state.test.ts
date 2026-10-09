import { describe, expect, test } from 'vitest';
import { formatClock, remainingMs } from '../src/state/clock';
import { INITIAL_STATE, reduce, type AppState } from '../src/state/gameStore';
import { parseRoute, roomPath } from '../src/state/route';
import { findMe, playerAtSeat, seatLayout, seatName, tokenScore } from '../src/state/selectors';
import {
  SERVER_NOW,
  autoUntil,
  lobbySnapshot,
  newMatch,
  playingSnapshot,
  roomSnapshot,
  snapshotFor,
} from './fixtures';

const inRoom = (): AppState =>
  [
    { type: 'room', snapshot: roomSnapshot(), receivedAt: SERVER_NOW } as const,
    { type: 'game', snapshot: playingSnapshot(), receivedAt: SERVER_NOW } as const,
  ].reduce(reduce, INITIAL_STATE);

describe('reduce', () => {
  test('tracks going online and offline, remembering when the connection dropped', () => {
    const online = reduce(INITIAL_STATE, { type: 'online' });
    const offline = reduce(online, { type: 'offline', at: 500 });
    const stillOffline = reduce(offline, { type: 'offline', at: 900 });

    expect(online.isOnline).toBe(true);
    expect(stillOffline).toMatchObject({ isOnline: false, offlineSince: 500 });
    expect(reduce(stillOffline, { type: 'online' }).offlineSince).toBeNull();
  });

  test('stays "reconnecting" after coming back online until the room is heard from', () => {
    const dropped = reduce(inRoom(), { type: 'offline', at: 500 });

    const online = reduce(dropped, { type: 'online' });
    const seated = reduce(online, {
      type: 'room',
      snapshot: roomSnapshot(),
      receivedAt: SERVER_NOW,
    });

    expect(online).toMatchObject({ isOnline: true, offlineSince: 500 });
    expect(seated.offlineSince).toBeNull();
  });

  test('stores the room and works out the clock difference', () => {
    const state = reduce(INITIAL_STATE, {
      type: 'room',
      snapshot: roomSnapshot(),
      receivedAt: SERVER_NOW - 4000,
    });

    expect(state.room?.code).toBe('KXT4P9');
    expect(state.clockOffset).toBe(4000);
  });

  test('stores the game state', () => {
    expect(inRoom().game?.view.phase).toBe('playing');
  });

  test('drops an old game state when the room is back in the lobby', () => {
    const state = reduce(inRoom(), {
      type: 'room',
      snapshot: lobbySnapshot(2),
      receivedAt: SERVER_NOW,
    });

    expect(state.game).toBeNull();
  });

  describe('after a match', () => {
    const matchOver = snapshotFor(
      autoUntil(newMatch(), (each) => each.phase === 'match-over').state,
      0,
      { deadline: null },
    );
    const ended = (): AppState =>
      [
        { type: 'game', snapshot: matchOver, receivedAt: SERVER_NOW } as const,
        { type: 'room', snapshot: lobbySnapshot(4), receivedAt: SERVER_NOW } as const,
      ].reduce(reduce, inRoom());

    test('keeps the result, with the seats it was played in, once the room is a lobby', () => {
      const state = ended();

      expect(state.room?.status).toBe('lobby');
      expect(state.game).toBeNull();
      expect(state.result?.game.view.phase).toBe('match-over');
      expect(state.result?.room.players.map((player) => player.seat)).toEqual([0, 1, 2, 3]);
    });

    test('lets the result go when the player returns to the lobby', () => {
      const state = reduce(ended(), { type: 'dismiss-result' });

      expect(state.result).toBeNull();
      expect(state.room?.status).toBe('lobby');
    });

    test('lets the result go when the next match is dealt', () => {
      const state = [
        { type: 'room', snapshot: roomSnapshot(), receivedAt: SERVER_NOW } as const,
        { type: 'game', snapshot: playingSnapshot(), receivedAt: SERVER_NOW } as const,
      ].reduce(reduce, ended());

      expect(state.result).toBeNull();
      expect(state.game?.view.phase).toBe('playing');
    });

    test('lets the result go when the room is closed or left', () => {
      expect(reduce(ended(), { type: 'closed', reason: 'kicked' }).result).toBeNull();
      expect(reduce(ended(), { type: 'reset' }).result).toBeNull();
    });
  });

  test('keeps the table on screen when another tab takes the seat', () => {
    const state = reduce(inRoom(), { type: 'replaced' });

    expect(state).toMatchObject({ closed: 'replaced' });
    expect(state.room).not.toBeNull();
  });

  test('clears the notice when the room is heard from again', () => {
    const replaced = reduce(inRoom(), { type: 'replaced' });

    const back = reduce(replaced, {
      type: 'room',
      snapshot: roomSnapshot(),
      receivedAt: SERVER_NOW,
    });

    expect(back.closed).toBeNull();
  });

  test('leaves the room when it is closed, keeping the reason', () => {
    expect(reduce(inRoom(), { type: 'closed', reason: 'kicked' })).toMatchObject({
      room: null,
      game: null,
      closed: 'kicked',
    });
  });

  test('clears everything about the room on reset', () => {
    const closed = reduce(inRoom(), { type: 'closed', reason: 'expired' });

    expect(reduce(closed, { type: 'reset' })).toMatchObject({
      room: null,
      game: null,
      closed: null,
    });
  });
});

describe('selectors', () => {
  test('find the player this snapshot was sent to', () => {
    expect(findMe(roomSnapshot({ youId: 'p2' }))?.name).toBe('Nimal');
  });

  test('find the player in a seat', () => {
    expect(playerAtSeat(roomSnapshot(), 3)?.name).toBe('Sunil');
  });

  test('put the partner opposite and the next player to the right', () => {
    const { view } = playingSnapshot();

    const layout = seatLayout(view);

    expect(layout.me).toBe(view.seat);
    expect(layout.right).toBe((view.seat + 1) % 4);
    expect(layout.partner).toBe((view.seat + 2) % 4);
    expect(layout.left).toBe((view.seat + 3) % 4);
  });

  test('put the next player to the left when play is clockwise', () => {
    const { view } = playingSnapshot();
    const clockwise = { ...view, config: { ...view.config, turnOrder: 'clockwise' as const } };

    expect(seatLayout(clockwise).left).toBe((view.seat + 3) % 4);
    expect(seatLayout(clockwise).partner).toBe((view.seat + 2) % 4);
  });

  test('score tokens from the player’s own side', () => {
    const { view } = playingSnapshot();
    const scored = { ...view, team: 'B' as const, tokens: { A: 6, B: 4 } };

    expect(tokenScore(scored)).toEqual({ us: 4, them: 6, target: 10 });
  });

  test('name the player’s own seat "You"', () => {
    const { view } = playingSnapshot();
    const other = ((view.seat + 1) % 4) as 0 | 1 | 2 | 3;

    expect(seatName(roomSnapshot(), view, view.seat)).toBe('You');
    expect(seatName(roomSnapshot(), view, other)).toBe(roomSnapshot().players[other]?.name);
  });
});

describe('clock', () => {
  test('counts down to a server deadline using the clock difference', () => {
    expect(remainingMs(10_000, 0, 1_000)).toBe(9_000);
    expect(remainingMs(10_000, 4_000, 1_000)).toBe(5_000);
  });

  test('never goes below zero', () => {
    expect(remainingMs(10_000, 0, 20_000)).toBe(0);
  });

  test.each([
    [9_000, '0:09'],
    [8_001, '0:09'],
    [60_000, '1:00'],
    [600_000, '10:00'],
    [0, '0:00'],
    [-50, '0:00'],
  ])('formats %i ms as %s', (ms, text) => {
    expect(formatClock(ms)).toBe(text);
  });
});

describe('routes', () => {
  test('read a room code from a room link, in any letter case', () => {
    expect(parseRoute('/r/kxt4p9')).toEqual({ name: 'room', code: 'KXT4P9' });
    expect(parseRoute(roomPath('KXT4P9'))).toEqual({ name: 'room', code: 'KXT4P9' });
  });

  test.each(['/', '/r/', '/r/short', '/r/KXT4P9/extra', '/r/KXT4P0', '/about'])(
    'treat %s as the home screen',
    (path) => {
      expect(parseRoute(path)).toEqual({ name: 'home' });
    },
  );
});
