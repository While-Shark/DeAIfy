import { describe, expect, it } from 'vitest';
import { calculateRealityScore, getScoreLabel, getVerdict } from './scoring';

const classify = (real: number, fake: number) => calculateRealityScore([
  { label: 'fake', score: fake }, { label: 'real', score: real },
]);

describe('reality score', () => {
  it('normalizes both classes to a 0–100 range', () => {
    expect(classify(0, 1)).toBe(0);
    expect(classify(1, 0)).toBe(100);
    expect(classify(0.42, 0.58)).toBe(42);
    expect(classify(3, 2)).toBe(60);
  });
  it('uses 60 as the inclusive initial screening boundary', () => {
    expect(getVerdict(59.99)).toBe('suspected');
    expect(getVerdict(60)).toBe('passed');
    expect(getScoreLabel(60)).toBe('初步通过');
    expect(getScoreLabel(80)).toBe('模型倾向真实照片');
  });
  it('preserves hundredths across source, preview and final export', () => {
    expect(classify(0.68123, 0.31877)).toBe(68.12);
    expect(calculateRealityScore([
      { label: 'real', score: 0.68123 }, { label: 'fake', score: 0.31877 },
    ], 0)).toBe(68);
  });
  it('does not invent scores for invalid predictions', () => {
    expect(() => calculateRealityScore([{ label: 'real', score: 1 }])).toThrow();
    expect(() => classify(Number.NaN, 0.5)).toThrow();
    expect(() => classify(0, 0)).toThrow();
  });
});
