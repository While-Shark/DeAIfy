import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { safeProcess } from '../src/image/process.js';

const natural = {
  strength: 50, grain: 8, warmth: 1, saturation: 0,
  contrast: 0, softness: 0, texture: 0,
};

describe('isolated Sharp image sanitizer', () => {
  it('decodes real PNG, re-encodes as WebP, and does not preserve original metadata', async () => {
    const image = await sharp({
      create: { width: 4, height: 4, channels: 4,
        background: { r: 160, g: 120, b: 100, alpha: 1 } },
    }).png().toBuffer();
    const output = await safeProcess(image, natural, 'image/webp');
    const metadata = await sharp(output).metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.width).toBe(4);
    expect(metadata.height).toBe(4);
    expect(metadata.exif).toBeUndefined();
    expect(output.length).toBeGreaterThan(10);
  });
  it('rejects a forged JPEG header with invalid payload', async () => {
    const forged = Buffer.concat([
      Buffer.from([255, 216, 255, 0]),
      Buffer.from('<?php echo "inject"; ?>'),
    ]);
    await expect(safeProcess(forged, natural, 'image/jpeg')).rejects.toThrow();
  });
  it('blocks unsupported markup and unsafe processing values', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    await expect(safeProcess(svg, natural, 'image/png')).rejects.toThrow();
    const image = await sharp({ create: {
      width: 4, height: 4, channels: 3, background: '#ffffff',
    }}).png().toBuffer();
    await expect(safeProcess(image, { ...natural, grain: 999 }, 'image/png')).rejects.toThrow();
  });
});
