import { expect, test, type Page } from '@playwright/test';

async function openLogin(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: "Yappin'" })).toBeVisible({ timeout: 20_000 });
}

test.describe('login and registration', () => {
  test('renders the unauthenticated entry screen', async ({ page }) => {
    await openLogin(page);

    await expect(page.getByLabel('Email address')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  });

  test('switches between sign in and account creation', async ({ page }) => {
    await openLogin(page);

    await page.getByRole('button', { name: 'Sign up' }).click();
    await expect(page.getByLabel('Display name')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create Account' })).toBeVisible();

    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByLabel('Display name')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  });

  test('validates display name before attempting sign up', async ({ page }) => {
    await openLogin(page);

    await page.getByRole('button', { name: 'Sign up' }).click();
    await page.getByLabel('Email address').fill('new-user@example.com');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Create Account' }).click();

    await expect(page.getByRole('alert')).toHaveText('Display name is required');
  });

  test('maps Firebase invalid credential errors to user-friendly copy', async ({ page }) => {
    await page.route('https://identitytoolkit.googleapis.com/**', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 400,
            message: 'INVALID_LOGIN_CREDENTIALS',
            errors: [{ message: 'INVALID_LOGIN_CREDENTIALS', domain: 'global', reason: 'invalid' }],
          },
        }),
      });
    });

    await openLogin(page);
    await page.getByLabel('Email address').fill('missing@example.com');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page.getByRole('alert')).toHaveText('Invalid email or password.');
  });
});
