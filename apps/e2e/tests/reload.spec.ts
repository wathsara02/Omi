import {
  expect,
  hand,
  handNames,
  playUntil,
  awaitPlayerOnTurn,
  expectAllToSee,
  roundResult,
  startMatch,
  tableCards,
  test,
} from '../support/table';

test('a player who reloads mid-trick is back in the same seat', async ({ table }) => {
  const { players, host, code } = table;
  await startMatch(table);

  // Two cards down: a trick is under way and someone is waited on.
  await playUntil(players, async () => (await tableCards(host.page).count()) === 2);
  const reloader = await awaitPlayerOnTurn(players);
  const { page } = reloader;
  const handBefore = await handNames(page);
  const tableBefore = await tableCards(page).evaluateAll((cards) =>
    cards.map((card) => card.getAttribute('aria-label')),
  );
  expect(handBefore.some((name) => name.endsWith(', playable'))).toBe(true);

  await page.reload();

  await test.step('the same hand, table and turn come back', async () => {
    await expect(page).toHaveURL(new RegExp(`/r/${code}$`));
    await expect(hand(page).getByRole('listitem')).toHaveCount(handBefore.length);
    expect(await handNames(page)).toEqual(handBefore);
    expect(
      await tableCards(page).evaluateAll((cards) =>
        cards.map((card) => card.getAttribute('aria-label')),
      ),
    ).toEqual(tableBefore);
    await expect(page.getByLabel('Your name')).toHaveCount(0);
  });

  await test.step('the others see nobody away and no bot', async () => {
    for (const other of players.filter((player) => player !== reloader)) {
      await expect(other.page.getByText(/^away/)).toHaveCount(0);
      await expect(other.page.getByText('bot', { exact: true })).toHaveCount(0);
    }
  });

  await test.step('the round carries on to its result', async () => {
    await playUntil(players, () => roundResult(host.page).isVisible());
    await expectAllToSee(players, roundResult);
  });
});
