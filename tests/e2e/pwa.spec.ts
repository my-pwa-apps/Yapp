import { expect, test } from '@playwright/test';

test.describe('PWA shell', () => {
  test('serves the app under the GitHub Pages base path', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/Yapp/i);
    const iconPath = await page.locator('link[rel="icon"]').evaluate((link) => {
      return new URL((link as HTMLLinkElement).href).pathname;
    });
    expect(iconPath).toBe('/Yapp/favicon.svg');
  });

  test('serves install and offline assets', async ({ request }) => {
    const [icon, offline, pushWorker] = await Promise.all([
      request.get('favicon.svg'),
      request.get('offline.html'),
      request.get('push-sw.js'),
    ]);

    expect(icon.ok()).toBeTruthy();
    expect(offline.ok()).toBeTruthy();
    expect(pushWorker.ok()).toBeTruthy();

    await expect(await icon.text()).toContain('<svg');
    await expect(await offline.text()).toContain("Yappin'");
    await expect(await pushWorker.text()).toContain('SW_VERSION: 16');
  });
});
