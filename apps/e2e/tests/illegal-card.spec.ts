import {
  blockedCards,
  expect,
  handNames,
  playUntil,
  playableCards,
  startMatch,
  tableCards,
  test,
  type Player,
} from '../support/table';

const SUIT = / of (clubs|diamonds|hearts|spades)/;

const suitOf = (cardName: string): string => {
  const suit = SUIT.exec(cardName)?.[1];
  if (suit === undefined) throw new Error(`No suit in "${cardName}"`);
  return suit;
};

test('a card that does not follow suit cannot be played', async ({ table }) => {
  const { players } = table;
  await startMatch(table);

  // Play on until the player to move holds a card they are not allowed to play.
  let blocked: Player | undefined;
  await playUntil(players, async () => {
    for (const player of players) {
      if ((await blockedCards(player.page).count()) > 0) blocked = player;
    }
    return blocked !== undefined;
  });
  if (blocked === undefined) throw new Error('Nobody was ever blocked');
  const { page } = blocked;

  const ledName = await tableCards(page).first().getAttribute('aria-label');
  const ledSuit = suitOf(ledName ?? '');
  const handBefore = await handNames(page);
  const tableBefore = await tableCards(page).count();

  await test.step('the blocked cards are exactly those of another suit', async () => {
    const playable = handBefore.filter((name) => name.endsWith(', playable'));
    const notPlayable = handBefore.filter((name) => name.endsWith(', not playable'));
    expect(playable.length).toBeGreaterThan(0);
    expect(notPlayable.length).toBeGreaterThan(0);
    expect(playable.map(suitOf).every((suit) => suit === ledSuit)).toBe(true);
    expect(notPlayable.map(suitOf).every((suit) => suit !== ledSuit)).toBe(true);
  });

  await test.step('pressing one does nothing', async () => {
    const card = blockedCards(page).first();
    await expect(card).toBeDisabled();
    // Forced, as a real click on a disabled button is refused by the browser itself.
    await card.click({ force: true });
    await card.dispatchEvent('click');

    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(await handNames(page)).toEqual(handBefore);
    await expect(tableCards(page)).toHaveCount(tableBefore);
  });

  await test.step('a card of the led suit still plays', async () => {
    await playableCards(page).first().click();
    await expect(tableCards(page)).not.toHaveCount(tableBefore);
    expect(await handNames(page)).toHaveLength(handBefore.length - 1);
  });
});
