import { describe, expect, it } from 'vitest';
import { adjustPixels } from './pixels';
import { getPreset } from './presets';

describe('local pixel processing', () => {
  it('keeps original pixel values when intensity is zero', () => {
    const pixels = new Uint8ClampedArray([100, 120, 150, 255, 40, 60, 80, 255]);
    adjustPixels(pixels, 2, 1, { ...getPreset('film').params, strength: 0 });
    expect([...pixels]).toEqual([100, 120, 150, 255, 40, 60, 80, 255]);
  });
  it('preserves alpha for transparent pixels', () => {
    const pixels = new Uint8ClampedArray([10, 20, 30, 0, 40, 50, 60, 128]);
    adjustPixels(pixels, 2, 1, getPreset('film').params);
    expect(pixels[3]).toBe(0);
    expect(pixels[7]).toBe(128);
  });
  it('produces repeatable, deterministic adjustments', () => {
    const source = new Uint8ClampedArray([100, 120, 140, 255, 90, 110, 130, 255]);
    const first = source.slice();
    const second = source.slice();
    adjustPixels(first, 2, 1, getPreset('natural').params);
    adjustPixels(second, 2, 1, getPreset('natural').params);
    expect([...first]).toEqual([...second]);
    expect([...first]).not.toEqual([...source]);
  });
});
