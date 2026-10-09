import {
  test as base,
  expect,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from '@playwright/test';

export interface Player {
  readonly name: string;
  readonly context: BrowserContext;
  readonly page: Page;
}

export interface Table {
  readonly code: string;
  /** In joining order; the first is the host. */
  readonly players: readonly Player[];
  readonly host: Player;
}

export const PLAYER_NAMES = ['Asha', 'Bimal', 'Chathu', 'Dilan'] as const;

const ROOM_URL = /\/r\/([A-Z0-9]+)$/;
const SWEEP_PAUSE_MS = 100;
const DEFAULT_PLAY_TIMEOUT_MS = 120_000;
const ON_TURN_TIMEOUT_MS = 10_000;

/** A person in their own browser profile, on the home screen. */
export const openPlayer = async (browser: Browser, name: string): Promise<Player> => {
  const context = await browser.newContext();
  const page = await context.newPage();
  return { name, context, page };
};

export const createRoom = async (player: Player): Promise<string> => {
  await player.page.goto('/');
  await player.page.getByLabel('Your name').fill(player.name);
  await player.page.getByRole('button', { name: 'Create a room' }).click();
  await player.page.waitForURL(ROOM_URL);
  const code = ROOM_URL.exec(player.page.url())?.[1];
  if (code === undefined) throw new Error(`No room code in ${player.page.url()}`);
  return code;
};

/** Joins as a friend would: type the code on the home screen. */
export const joinRoom = async (player: Player, code: string): Promise<void> => {
  await player.page.goto('/');
  await player.page.getByLabel('Your name').fill(player.name);
  await player.page.getByLabel('Room code').fill(code);
  await player.page.getByRole('button', { name: 'Join', exact: true }).click();
  await player.page.waitForURL(ROOM_URL);
};

/**
 * Four players in one lobby, the match not yet started. `prepare` is given each
 * player before their page loads anything.
 */
export const fillLobby = async (
  browser: Browser,
  prepare: (player: Player) => void = () => undefined,
): Promise<Table> => {
  const players = await Promise.all(PLAYER_NAMES.map((name) => openPlayer(browser, name)));
  players.forEach(prepare);
  const [host, ...others] = players;
  if (host === undefined) throw new Error('No players');
  const code = await createRoom(host);
  // One at a time, so the joining order is the same on every run.
  for (const player of others) await joinRoom(player, code);
  await expect(host.page.getByText('4 of 4')).toBeVisible();
  return { code, players, host };
};

export const hand = (page: Page) => page.getByRole('list', { name: 'Your hand' });
export const trumpChoices = (page: Page) =>
  page.getByRole('group', { name: 'Choose trump' }).getByRole('button');
export const playableCards = (page: Page) => hand(page).getByRole('button', { disabled: false });
export const blockedCards = (page: Page) => hand(page).getByRole('button', { disabled: true });
/** Cards lying on the table, each named with who led or played it. */
export const tableCards = (page: Page) => page.getByRole('img', { name: / (led|played) by / });
/** The accessible names of the cards in hand, in the order shown. */
export const handNames = (page: Page): Promise<string[]> =>
  hand(page)
    .locator('[aria-label]')
    .evaluateAll((cards) => cards.map((card) => card.getAttribute('aria-label') ?? ''));
/** The player whose move it is, if they are among those listed. */
export const playerOnTurn = async (players: readonly Player[]): Promise<Player | null> => {
  for (const player of players) {
    const choices = await trumpChoices(player.page).count();
    if (choices > 0 || (await playableCards(player.page).count()) > 0) return player;
  }
  return null;
};
/** As `playerOnTurn`, but waits for that player's page to catch up with the table. */
export const awaitPlayerOnTurn = async (players: readonly Player[]): Promise<Player> => {
  const [watcher] = players;
  if (watcher === undefined) throw new Error('No players');
  const deadline = Date.now() + ON_TURN_TIMEOUT_MS;
  for (;;) {
    const found = await playerOnTurn(players);
    if (found !== null) return found;
    if (Date.now() > deadline) throw new Error('Nobody is on turn');
    await watcher.page.waitForTimeout(SWEEP_PAUSE_MS);
  }
};
/** Checks all the pages at once; some screens are only up for a few seconds. */
export const expectAllToSee = async (
  players: readonly Player[],
  locate: (page: Page) => Locator,
): Promise<void> => {
  await Promise.all(players.map((player) => expect(locate(player.page)).toBeVisible()));
};
export const roundResult = (page: Page) => page.getByText('Next round', { exact: true });
export const matchEnd = (page: Page) => page.getByRole('button', { name: 'Back to lobby' });

export const startMatch = async (table: Table): Promise<void> => {
  await table.host.page.getByRole('button', { name: 'Start match' }).click();
  await Promise.all(
    table.players.map((player) => expect(hand(player.page).getByRole('listitem')).toHaveCount(4)),
  );
};

/**
 * If it is this player's move, makes it: the first suit as trump, or the first
 * playable card. Returns what was done, or null when it is not their move.
 */
export const actIfOnTurn = async (page: Page): Promise<string | null> => {
  const suit = trumpChoices(page).first();
  if ((await suit.count()) > 0) {
    await suit.click();
    await expect(trumpChoices(page)).toHaveCount(0);
    return 'called trump';
  }
  const card = playableCards(page).first();
  if ((await card.count()) === 0) return null;
  const label = await card.getAttribute('aria-label');
  if (label === null) throw new Error('A playable card has no name');
  await card.click();
  // The server confirms every play; the card leaves the hand when it has.
  await expect(hand(page).getByRole('button', { name: label, exact: true })).toHaveCount(0);
  return label;
};

/** Makes the next move for whichever listed player is on turn; false if none is. */
export const actOnce = async (players: readonly Player[]): Promise<boolean> => {
  for (const player of players) {
    if ((await actIfOnTurn(player.page)) !== null) return true;
  }
  return false;
};

interface PlayOptions {
  readonly timeoutMs?: number;
}

/**
 * Has the listed players take their turns until `isDone` says to stop. A seat
 * with nobody listed for it is left to the server's timer or its bot.
 */
export const playUntil = async (
  players: readonly Player[],
  isDone: () => Promise<boolean>,
  { timeoutMs = DEFAULT_PLAY_TIMEOUT_MS }: PlayOptions = {},
): Promise<void> => {
  const [watcher] = players;
  if (watcher === undefined) throw new Error('No players to play with');
  const deadline = Date.now() + timeoutMs;
  while (!(await isDone())) {
    if (Date.now() > deadline) throw new Error(`Play did not finish within ${timeoutMs} ms`);
    // One move at a time, so `isDone` sees every state the table passes through.
    if (!(await actOnce(players))) await watcher.page.waitForTimeout(SWEEP_PAUSE_MS);
  }
};

interface Fixtures {
  /** A full lobby of four, closed again when the test ends. */
  table: Table;
}

export const closeTable = async (table: Table): Promise<void> => {
  await Promise.all(table.players.map((player) => player.context.close()));
};

export const test = base.extend<Fixtures>({
  table: async ({ browser }, use) => {
    const table = await fillLobby(browser);
    await use(table);
    await closeTable(table);
  },
});

export { expect };
