import { describe, expect, it } from 'vitest';
import { applyBrushStrokes } from './brush';

describe('brush local adjustments', () => {
  it('adjusts only pixels near the actual image coordinate and preserves alpha', () => {
    const pixels = new Uint8ClampedArray(Array.from({ length: 12 * 12 }, () => [100, 100, 100, 255]).flat());
    applyBrushStrokes(pixels, 12, 12, [{ x: 0.5, y: 0.5, radius: 0.3, amount: 1, tool: 'lighten' }]);
    expect(pixels[(6 * 12 + 6) * 4]).toBeGreaterThan(100);
    expect(pixels[0]).toBe(100);
    expect(pixels[3]).toBe(255);
  });
  it('does not modify image for zero strength', () => {
    const pixels = new Uint8ClampedArray([100, 100, 100, 255, 50, 50, 50, 255, 30, 30, 30, 255]);
    const source = pixels.slice();
    applyBrushStrokes(pixels, 3, 1, [{ x: 0.5, y: 0.5, radius: 0.5, amount: 0, tool: 'warm' }]);
    expect(pixels).toEqual(source);
  });
});
