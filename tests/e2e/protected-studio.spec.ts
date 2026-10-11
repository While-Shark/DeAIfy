import { expect, test } from '@playwright/test';

test('obfuscated production build loads and keeps local image editing functional', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', err => errors.push(err.message));

  await page.goto('/');
  await expect(page.getByRole('heading', { name: '源文件' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '自然化工作台' })).toBeVisible();

  // No external images or AI model weights are required for a local preview.
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 48;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#87a6b2';
    ctx.fillRect(0, 0, 64, 48);
    ctx.fillStyle = '#c69661';
    ctx.fillRect(12, 8, 35, 22);
    return canvas.toDataURL('image/png').split(',')[1]!;
  });
  await page.locator('input[type=file]').setInputFiles({
    name: 'ci-photo.png',
    mimeType: 'image/png',
    buffer: Buffer.from(base64, 'base64'),
  });

  await expect(page.locator('.file-info-copy strong')).toHaveText('ci-photo.png');
  const preview = page.getByRole('img', { name: '处理后的图像预览' });
  await expect(preview).toBeVisible({ timeout: 25_000 });
  // Presence of the compare slider means the real image Web Worker completed,
  // not merely that Vue displayed the original fallback image.
  await expect(page.getByRole('slider', { name: '拖动比较处理前后的图片' }))
    .toBeVisible({ timeout: 25_000 });

  const filmPreset = page.getByRole('button', { name: /胶片质感/ });
  await filmPreset.click();
  await expect(filmPreset).toHaveAttribute('aria-pressed', 'true');

  const strength = page.getByRole('slider', { name: '自然化强度' });
  await strength.fill('50');
  await expect(page.locator('.slider-field').first().locator('output')).toHaveText('50%');

  // Any uncaught app exception indicates obfuscation damaged the bundled runtime.
  expect(errors).toEqual([]);
});
