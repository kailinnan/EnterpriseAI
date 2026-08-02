import { expect, test } from '@playwright/test';

test('renders the enterprise login experience', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: /登录|欢迎/ })).toBeVisible();
  await expect(page.getByLabel(/邮箱/)).toBeVisible();
  await expect(page.getByLabel(/密码/)).toBeVisible();
  await expect(page.getByRole('button', { name: /进入/ })).toBeVisible();
});
