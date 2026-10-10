import { expect, test } from '@playwright/test';

test('homepage renders header and content', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('header')).toBeVisible();
});
