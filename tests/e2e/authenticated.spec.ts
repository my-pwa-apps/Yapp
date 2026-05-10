import { expect, test, type Page } from '@playwright/test';

async function openAuthenticatedApp(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('yapp:e2e-mock-auth', 'true');
  });
  await page.goto('/');
  await expect(page.getByText('Launch Squad')).toBeVisible({ timeout: 20_000 });
}

test.describe('authenticated app flows', () => {
  test('opens a seeded chat and sends a message', async ({ page }) => {
    await openAuthenticatedApp(page);

    await page.getByText('Launch Squad').click();
    await expect(page.getByText('Welcome to the launch room.')).toBeVisible();

    await page.getByLabel('Type a message').fill('Playwright says hi');
    await page.getByRole('button', { name: 'Send message' }).click();

    await expect(page.getByText('Playwright says hi')).toBeVisible();
  });

  test('switches to Yapps and publishes a new post', async ({ page }) => {
    await openAuthenticatedApp(page);

    await page.getByRole('button', { name: 'Yapps' }).click();
    await expect(page.getByText('A public test yapp for the feed.')).toBeVisible();

    await page.getByPlaceholder("What's on your mind? Start yappin'...").fill('Playwright published this yapp');
    await page.getByRole('button', { name: 'Yapp', exact: true }).click();

    await expect(page.getByText('Playwright published this yapp')).toBeVisible();
  });

  test('searches seeded Yapps without leaving authenticated mode', async ({ page }) => {
    await openAuthenticatedApp(page);

    await page.getByRole('button', { name: 'Yapps' }).click();
    await page.getByRole('button', { name: 'Search yapps' }).click();
    await page.getByPlaceholder('Search yapps...').fill('public test');

    await expect(page.getByText('A public test yapp for the feed.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close search' })).toBeVisible();
  });
});

test.describe('chat scroll restoration', () => {
  test('opens an unseen chat at the newest message', async ({ page }) => {
    await openAuthenticatedApp(page);

    await page.getByText('Scroll Lab').click();

    await expect(page.locator('.message-text').getByText('Scroll memory message 36', { exact: true })).toBeVisible();
  });

  test('restores the saved position when reopening a chat', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('yapp:chat-scroll:e2e-user:e2e-scroll-chat', JSON.stringify({
        scrollTop: 0,
        bottomDistance: 1000,
      }));
    });
    await openAuthenticatedApp(page);

    await page.getByText('Scroll Lab').click();

    await expect(page.locator('.message-text').getByText('Scroll memory message 1', { exact: true })).toBeVisible();
  });
});
