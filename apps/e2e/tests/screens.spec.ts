import { expectAccessible } from '../support/accessibility';
import { captureScreen } from '../support/screens';
import {
  expect,
  playUntil,
  awaitPlayerOnTurn,
  roundResult,
  startMatch,
  tableCards,
  test,
  trumpChoices,
} from '../support/table';

test('every screen up to the round result fits at each width and passes the accessibility rules', async ({
  table,
  browser,
}, testInfo) => {
  const { players, host } = table;

  await test.step('home', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Create a room' })).toBeVisible();
    await expectAccessible(page, 'home');
    await captureScreen(page, 'home', testInfo);
    await context.close();
  });

  await test.step('lobby', async () => {
    await expectAccessible(host.page, 'lobby');
    await captureScreen(host.page, 'lobby', testInfo);
  });

  await test.step('trump call', async () => {
    await startMatch(table);
    const caller = await awaitPlayerOnTurn(players);
    await expect(trumpChoices(caller.page)).toHaveCount(4);
    await expectAccessible(caller.page, 'trump call');
    await captureScreen(caller.page, 'trump-call', testInfo);
  });

  await test.step('trick play', async () => {
    await playUntil(players, async () => (await tableCards(host.page).count()) === 2);
    const onTurn = await awaitPlayerOnTurn(players);
    await expectAccessible(onTurn.page, 'trick play');
    await captureScreen(onTurn.page, 'trick-play', testInfo);
  });

  await test.step('round result', async () => {
    await playUntil(players, () => roundResult(host.page).isVisible());
    await expectAccessible(host.page, 'round result');
    await captureScreen(host.page, 'round-result', testInfo, roundResult(host.page));
  });
});
