import { describe, expect, it } from 'vitest';
import { cloneParams, getPreset, PRESETS } from './presets';

const supported = new Set(['natural', 'portrait', 'film', 'documentary', 'softlight']);

describe('one-click naturalization presets', () => {
  it('ships exactly five distinct presets with valid ids', () => {
    expect(PRESETS).toHaveLength(5);
    expect(new Set(PRESETS.map((preset) => preset.id))).toEqual(supported);
    expect(new Set(PRESETS.map((preset) => JSON.stringify(preset.params))).size).toBe(5);
  });

  it('has complete parameters in supported control ranges', () => {
    for (const preset of PRESETS) {
      expect(preset.title).toBeTruthy();
      expect(preset.subtitle).toBeTruthy();
      expect(preset.params.strength).toBeGreaterThanOrEqual(0);
      expect(preset.params.strength).toBeLessThanOrEqual(100);
      expect(preset.params.grain).toBeGreaterThanOrEqual(0);
      expect(preset.params.grain).toBeLessThanOrEqual(80);
      expect(preset.params.softness).toBeGreaterThanOrEqual(0);
      expect(preset.params.softness).toBeLessThanOrEqual(50);
      expect(preset.params.texture).toBeGreaterThanOrEqual(0);
      expect(preset.params.texture).toBeLessThanOrEqual(60);
      for (const key of ['warmth', 'saturation', 'contrast'] as const) {
        expect(preset.params[key]).toBeGreaterThanOrEqual(-40);
        expect(preset.params[key]).toBeLessThanOrEqual(40);
      }
    }
  });

  it('clones parameters so a user adjustment does not mutate a preset', () => {
    const original = getPreset('softlight').params;
    const draft = cloneParams(original);
    draft.strength = 25;
    expect(original.strength).toBe(72);
    expect(draft.strength).toBe(25);
  });
});
