import { HOLD_SECONDS } from '../support/settings';
import { expect, matchEnd, playUntil, startMatch, tableCards, test } from '../support/table';

const MATCH_TIMEOUT_MS = 480_000;
const MS_PER_SECOND = 1000;
/** The hold itself, with room for a turn timer to run out on the empty seat first. */
const TAKEOVER_TIMEOUT_MS = (HOLD_SECONDS + 20) * MS_PER_SECOND;

test('a closed tab is taken over by a bot and the match finishes', async ({ table }) => {
  const { players, host } = table;
  const leaver = players[2];
  if (leaver === undefined) throw new Error('Not enough players');
  const remaining = players.filter((player) => player !== leaver);
  await startMatch(table);
  await playUntil(players, async () => (await tableCards(host.page).count()) === 2);

  await leaver.page.close();

  await test.step('the seat is held, then a bot plays it', async () => {
    await expect(host.page.getByText(/^away/)).toBeVisible();
    const leaverSeat = host.page.getByRole('group', { name: new RegExp(`^${leaver.name}`) });
    await expect(leaverSeat.getByText('bot', { exact: true })).toBeVisible({
      timeout: TAKEOVER_TIMEOUT_MS,
    });
    await expect(host.page.getByText(/^away/)).toHaveCount(0);
  });

  await test.step('the three who stayed finish the match with it', async () => {
    await playUntil(remaining, () => matchEnd(host.page).isVisible(), {
      timeoutMs: MATCH_TIMEOUT_MS,
    });
    for (const player of remaining) await expect(matchEnd(player.page)).toBeVisible();
  });

  await test.step('the lobby afterwards has only the three', async () => {
    await host.page.getByRole('button', { name: 'Back to lobby' }).click();

    await expect(host.page.getByText('3 of 4')).toBeVisible();
    await expect(host.page.getByRole('listitem').filter({ hasText: leaver.name })).toHaveCount(0);
    await expect(host.page.getByRole('button', { name: 'Start match' })).toBeDisabled();
    await expect(host.page.getByText('Needs 4 players')).toBeVisible();
  });
});
