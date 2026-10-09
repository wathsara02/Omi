import { captureScreen } from '../support/screens';
import {
  expect,
  playUntil,
  playerOnTurn,
  roundResult,
  startMatch,
  tableCards,
  test,
  trumpChoices,
} from '../support/table';

test('every screen up to the round result fits at each width', async ({
  table,
  browser,
}, testInfo) => {
  const { players, host } = table;

  await test.step('home', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Create a room' })).toBeVisible();
    await captureScreen(page, 'home', testInfo);
    await context.close();
  });

  await test.step('lobby', async () => {
    await captureScreen(host.page, 'lobby', testInfo);
  });

  await test.step('trump call', async () => {
    await startMatch(table);
    const caller = await playerOnTurn(players);
    if (caller === null) throw new Error('Nobody is calling trump');
    await expect(trumpChoices(caller.page)).toHaveCount(4);
    await captureScreen(caller.page, 'trump-call', testInfo);
  });

  await test.step('trick play', async () => {
    await playUntil(players, async () => (await tableCards(host.page).count()) === 2);
    const onTurn = await playerOnTurn(players);
    if (onTurn === null) throw new Error('Nobody is on turn');
    await captureScreen(onTurn.page, 'trick-play', testInfo);
  });

  await test.step('round result', async () => {
    await playUntil(players, () => roundResult(host.page).isVisible());
    await captureScreen(host.page, 'round-result', testInfo);
  });
});
