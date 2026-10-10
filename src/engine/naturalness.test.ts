import { describe, expect, it } from 'vitest';
import { analyzeNaturalness } from './naturalness';

describe('photographic texture diagnostics', () => {
  it('returns a finite and bounded heuristic without claiming AI probability', () => {
    const pixels = new Uint8ClampedArray(12 * 12 * 4);
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = (i / 4) % 256;
      pixels[i + 1] = 125;
      pixels[i + 2] = 55;
      pixels[i + 3] = 255;
    }
    const output = analyzeNaturalness(pixels, 12, 12);
    expect(output.index).toBeGreaterThanOrEqual(0);
    expect(output.index).toBeLessThanOrEqual(100);
    expect(output.notes.length).toBeGreaterThan(0);
  });
  it('flags a fully clipped white image', () => {
    const pixels = new Uint8ClampedArray(8 * 8 * 4).fill(255);
    const result = analyzeNaturalness(pixels, 8, 8);
    expect(result.clippedPercent).toBe(100);
    expect(result.index).toBeLessThan(80);
  });
});
