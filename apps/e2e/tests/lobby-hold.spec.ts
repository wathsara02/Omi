import { expect, test } from '../support/table';

test('a player who reloads in the lobby keeps their place', async ({ table }) => {
  const { players, host } = table;
  const guest = players[2];
  if (guest === undefined) throw new Error('Not enough players');

  await guest.page.reload();

  await expect(guest.page.getByText('4 of 4')).toBeVisible();
  await expect(guest.page.getByText('Waiting for the host to start')).toBeVisible();
  await expect(guest.page.getByLabel('Your name')).toHaveCount(0);
  await expect(host.page.getByText('4 of 4')).toBeVisible();
  await expect(host.page.getByText(/^away/)).toHaveCount(0);
  await expect(host.page.getByRole('button', { name: 'Start match' })).toBeEnabled();
});

test('a player whose tab closes is shown as away, and the host can remove them', async ({
  table,
}) => {
  const { players, host } = table;
  const [, watcher, gone] = players;
  if (watcher === undefined || gone === undefined) throw new Error('Not enough players');

  await gone.page.close();

  await test.step('their place is held and the match cannot start', async () => {
    const row = host.page.getByRole('listitem').filter({ hasText: gone.name });
    await expect(row.getByText(/^away 0:\d\d$/)).toBeVisible();
    await expect(host.page.getByText('4 of 4')).toBeVisible();
    await expect(host.page.getByRole('button', { name: 'Start match' })).toBeDisabled();
    await expect(host.page.getByText(`${gone.name} is away. Wait, or remove them.`)).toBeVisible();
    await expect(watcher.page.getByText(`Waiting for ${gone.name} to reconnect`)).toBeVisible();
  });

  await test.step('the host removes them and the place opens', async () => {
    await host.page.getByRole('button', { name: `Remove ${gone.name}` }).click();

    await expect(host.page.getByText('3 of 4')).toBeVisible();
    await expect(host.page.getByText('Needs 4 players')).toBeVisible();
    await expect(watcher.page.getByText('Waiting for one more player')).toBeVisible();
  });
});
