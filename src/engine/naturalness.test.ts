import { describe, expect, it } from 'vitest';
import { analyzeNaturalness } from './naturalness';

function pixels(width: number, height: number, getColor: (x: number, y: number) => [number, number, number]) {
  const array = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const [r, g, b] = getColor(x, y);
      array.set([r, g, b, 255], i);
    }
  }
  return array;
}

describe('four-axis photographic diagnostics', () => {
  it('returns a bounded index and four independently explainable scores', () => {
    const result = analyzeNaturalness(pixels(24, 24, (x, y) => [80 + x * 2, 80 + y * 2, 110]), 24, 24);
    expect(Object.keys(result.dimensions).sort()).toEqual(['color', 'edges', 'exposure', 'texture']);
    for (const value of [result.index, ...Object.values(result.dimensions)]) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
    expect(result.notes.length).toBeGreaterThan(0);
  });
  it('penalizes extensive clipping without labeling it AI-generated', () => {
    const result = analyzeNaturalness(pixels(12, 12, () => [255, 255, 255]), 12, 12);
    expect(result.clippedPercent).toBe(100);
    expect(result.dimensions.exposure).toBe(0);
    expect(result.index).toBeLessThan(80);
  });
  it('detects over-saturation distinctly from exposure', () => {
    const intense = analyzeNaturalness(pixels(24, 24, (x) => [100 + x, 0, 0]), 24, 24);
    const neutral = analyzeNaturalness(pixels(24, 24, (x) => [100 + x, 100 + x, 100 + x]), 24, 24);
    expect(intense.dimensions.color).toBeLessThan(neutral.dimensions.color);
  });
  it('rejects transparent-only images and invalid dimensions without invented scores', () => {
    expect(() => analyzeNaturalness(new Uint8ClampedArray(8 * 8 * 4), 8, 8)).toThrow('透明图像');
    expect(() => analyzeNaturalness(new Uint8ClampedArray(4), 12, 12)).toThrow();
  });
});
