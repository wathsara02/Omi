import { expect, test } from '@playwright/test';

// These cannot be set from inside the page (frame-ancestors is ignored in a
// <meta> policy), so whatever serves the built files must send them. The
// preview server does; a real host has to be configured to do the same.
test('the page is served with its security headers', async ({ request }) => {
  const response = await request.get('/');
  const headers = response.headers();

  expect(response.ok()).toBe(true);
  expect(headers['content-security-policy']).toBe("frame-ancestors 'none'");
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(headers['permissions-policy']).toBe('camera=(), microphone=(), geolocation=()');
});

test('the page still loads and connects under those headers', async ({ page }) => {
  const refused: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') refused.push(message.text());
  });

  await page.goto('/');
  await page.getByLabel('Your name').fill('Asha');
  await page.getByRole('button', { name: 'Create a room' }).click();

  await expect(page.getByText('1 of 4')).toBeVisible();
  expect(refused).toEqual([]);
});
