import {
  PLAYER_NAMES,
  expect,
  expectAllToSee,
  hand,
  playUntil,
  roundResult,
  startMatch,
  test,
  trumpChoices,
} from '../support/table';

test('four players meet in a room and play a round', async ({ table }) => {
  const { players, host, code } = table;

  await test.step('everyone is in the lobby', async () => {
    for (const player of players) {
      await expect(player.page).toHaveURL(new RegExp(`/r/${code}$`));
      for (const name of PLAYER_NAMES) {
        await expect(player.page.getByRole('listitem').filter({ hasText: name })).toBeVisible();
      }
    }
    for (const guest of players.slice(1)) {
      await expect(guest.page.getByText('Waiting for the host to start')).toBeVisible();
      await expect(guest.page.getByRole('button', { name: 'Start match' })).toHaveCount(0);
    }
  });

  await test.step('the host starts and four cards are dealt to each', async () => {
    await startMatch(table);
    const callers = await Promise.all(players.map((player) => trumpChoices(player.page).count()));
    // Exactly one player is asked to call trump, with all four suits on offer.
    expect(callers.filter((count) => count > 0)).toEqual([4]);
  });

  await test.step('the round is played to its result', async () => {
    await playUntil(players, () => roundResult(host.page).isVisible());

    await expectAllToSee(players, roundResult);
    await expectAllToSee(players, (page) => page.getByText('Round 1', { exact: true }));
  });

  await test.step('the next round is dealt', async () => {
    for (const player of players) {
      await expect(hand(player.page).getByRole('listitem')).toHaveCount(4);
      await expect(player.page.getByText('Round 2 · no trump yet')).toBeVisible();
    }
  });
});
