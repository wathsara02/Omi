import { captureScreen } from '../support/screens';
import { expect, hand, matchEnd, playUntil, startMatch, test } from '../support/table';

const MATCH_TIMEOUT_MS = 480_000;

test('a match is played to 10 tokens, then the room plays another', async ({ table }, testInfo) => {
  const { players, host } = table;
  const [, stayer, ...leavers] = players;
  if (stayer === undefined) throw new Error('Not enough players');
  await startMatch(table);

  let sawFinalRoundResult = false;
  await playUntil(
    players,
    async () => {
      // The last round's result is shown for a few seconds before the match result.
      if (await host.page.getByText('The match result is next').isVisible()) {
        sawFinalRoundResult = true;
      }
      return matchEnd(host.page).isVisible();
    },
    { timeoutMs: MATCH_TIMEOUT_MS },
  );

  await test.step('everyone sees the match result, two as winners', async () => {
    expect(sawFinalRoundResult).toBe(true);
    let winners = 0;
    for (const player of players) {
      await expect(matchEnd(player.page)).toBeVisible();
      const headline = await player.page.getByRole('heading', { level: 1 }).innerText();
      expect(['You won the match', 'You lost the match']).toContain(headline);
      if (headline === 'You won the match') {
        winners += 1;
        await expect(player.page.getByLabel(/^1\d to \d$/)).toBeVisible();
      }
    }
    expect(winners).toBe(2);
  });

  await test.step('the match result fits at each width', async () => {
    await captureScreen(host.page, 'match-end', testInfo);
  });

  await test.step('the room is a lobby again, with all four in it', async () => {
    await host.page.getByRole('button', { name: 'Back to lobby' }).click();
    await expect(host.page.getByText('4 of 4')).toBeVisible();
    await expect(host.page.getByRole('button', { name: 'Start match' })).toBeEnabled();

    for (const player of leavers) {
      await player.page.getByRole('button', { name: 'Back to lobby' }).click();
      await expect(player.page.getByText('Waiting for the host to start')).toBeVisible();
    }
  });

  await test.step('the host starts the next match, from nil–nil', async () => {
    await host.page.getByRole('button', { name: 'Start match' }).click();

    // Including the player who never left the result screen.
    await expect(matchEnd(stayer.page)).toHaveCount(0);
    for (const player of players) {
      await expect(hand(player.page).getByRole('listitem')).toHaveCount(4);
      await expect(player.page.getByText('Round 1 · no trump yet')).toBeVisible();
      await expect(player.page.getByLabel(/: 0 of 10 tokens$/)).toHaveCount(2);
    }
  });
});
