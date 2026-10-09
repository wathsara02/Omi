import type { Card } from '@omi/engine';
import { expect, test } from '@playwright/test';
import { findLeaks, gameStatesIn, record, type Recording } from '../support/leak';
import { closeTable, fillLobby, playUntil, startMatch } from '../support/table';

const ROUNDS_WATCHED = 2;

test('no frame ever shows a player a card they should not see', async ({ browser }) => {
  const recordings = new Map<string, Recording>();
  const table = await fillLobby(browser, (player) => {
    recordings.set(player.name, record(player.page));
  });
  const { players, host } = table;

  await startMatch(table);
  await playUntil(players, () =>
    host.page.getByText(`Round ${ROUNDS_WATCHED + 1} · no trump yet`).isVisible(),
  );
  await closeTable(table);

  for (const player of players) {
    const mine = recordings.get(player.name);
    const others = players
      .filter((other) => other !== player)
      .map((other) => recordings.get(other.name)?.frames ?? []);
    if (mine === undefined) throw new Error(`Nothing recorded for ${player.name}`);

    // The recorder only reads WebSocket frames, so nothing may travel another way.
    expect(mine.pollingRequests, `${player.name}: long-polling requests`).toEqual([]);
    const states = gameStatesIn(mine.frames);
    // Two rounds are 2 trump calls and 64 card plays, each a new state.
    expect(states.length, `${player.name}: game states received`).toBeGreaterThan(64);
    expect(
      states.some((state) => state.view.hand.length === 8),
      `${player.name}: was dealt a full hand`,
    ).toBe(true);
    expect(findLeaks(mine.frames, others), `${player.name}: leaks`).toEqual([]);
  }
});

test.describe('the leak checker', () => {
  const card = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit });
  const MINE = [card('A', 'spades'), card('K', 'spades'), card('Q', 'spades'), card('J', 'spades')];
  const THEIRS = [
    card('A', 'hearts'),
    card('K', 'hearts'),
    card('Q', 'hearts'),
    card('J', 'hearts'),
  ];
  const SECOND = [card('7', 'clubs'), card('8', 'clubs'), card('9', 'clubs'), card('10', 'clubs')];

  const state = (seq: number, view: Record<string, unknown>): string =>
    `42${JSON.stringify(['game:state', { seq, view }])}`;
  const calling = (seq: number, hand: readonly Card[], extra: Record<string, unknown> = {}) =>
    state(seq, { phase: 'calling-trump', trump: null, hand, ...extra });
  const playing = (seq: number, hand: readonly Card[], extra: Record<string, unknown> = {}) =>
    state(seq, { phase: 'playing', trump: 'hearts', hand, ...extra });

  const theirFrames = [calling(1, THEIRS), playing(2, THEIRS)];

  test('passes frames that show only the player’s own cards', () => {
    const mine = [
      '0{"sid":"x"}',
      '40{"sid":"y"}',
      calling(1, MINE),
      playing(2, [...MINE, ...SECOND]),
    ];

    expect(findLeaks(mine, [theirFrames])).toEqual([]);
  });

  test('reports a card another player still holds', () => {
    const mine = [calling(1, MINE), playing(2, MINE, { previousTrick: { plays: [THEIRS[0]] } })];

    expect(findLeaks(mine, [theirFrames])).toEqual([
      'state 2: shows A-hearts, which another player still holds',
    ]);
  });

  test('reports a second-batch card sent before trump is called', () => {
    const mine = [calling(1, MINE, { next: SECOND[0] }), playing(2, [...MINE, ...SECOND])];

    expect(findLeaks(mine, [theirFrames])).toEqual([
      'state 2: 7-clubs of the second batch was sent before trump was called',
    ]);
  });

  test('reports more than four cards in hand before trump is called', () => {
    const mine = [calling(1, [...MINE, SECOND[0] as Card])];

    expect(findLeaks(mine, [theirFrames])).toContain(
      'state 1: 5 cards in hand before trump is called',
    );
  });

  test('reports cards outside a game state, and fields that must never be sent', () => {
    const mine = [
      `42${JSON.stringify(['room:state', { players: [{ hand: THEIRS }] }])}`,
      `431${JSON.stringify([{ ok: true, data: { rng: [1, 2, 3, 4] } }])}`,
    ];

    expect(findLeaks(mine, [theirFrames])).toEqual([
      'room:state carries cards: A-hearts K-hearts Q-hearts J-hearts',
      'an acknowledgement has a "rng" field',
    ]);
  });

  test('reports a state it has no truth for, rather than passing it', () => {
    expect(findLeaks([playing(9, MINE)], [theirFrames])).toEqual([
      'state 9: cannot be checked, not every other player received it',
    ]);
  });
});
