import { expect, test } from '@playwright/test';

test('Docs navigation supports presets, examples, back navigation and direct links', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('link', { name: 'Docs' }).click();
  await expect(page).toHaveURL(/\/docs$/);
  await expect(page.getByRole('heading', { name: '外部 HTTP API 接入指南' })).toBeVisible();

  await page.getByLabel('文档预设').selectOption('film');
  await page.getByLabel('文档强度').selectOption('high');
  await expect(page.locator('.doc-code').first().locator('code')).toContainText('"strength": 100');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const copyParams = page.locator('.doc-code').first().getByRole('button', { name: '复制' });
  await copyParams.click();
  await expect(copyParams).toContainText('已复制');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('"strength": 100');
  await page.getByRole('button', { name: 'Node.js' }).click();
  await expect(page.locator('.doc-code').nth(1)).toContainText("fetch(base + '/api/process'");
  await page.getByRole('button', { name: 'Python' }).click();
  await expect(page.locator('.doc-code').nth(1)).toContainText('requests.post');

  await page.getByRole('link', { name: 'DeAIfy 工作台' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: '自然化工作台' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: '外部 HTTP API 接入指南' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: '外部 HTTP API 接入指南' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('Docs stays readable on mobile and links to its sections', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/docs');
  await expect(page.getByRole('link', { name: 'Docs' })).toBeVisible();
  await page.locator('.docs-nav a[href="#security"]').click();
  await expect(page).toHaveURL(/\/docs#security$/);
  await expect(page.getByRole('heading', { name: '安全、隐私与限制' })).toBeVisible();
  const width = await page.evaluate(() => ({ actual: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  expect(width.actual).toBeLessThanOrEqual(width.viewport + 1);
});
