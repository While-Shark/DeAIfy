import { describe, expect, it } from 'vitest';
import { calculateRealityScore, getScoreLabel, getVerdict } from './scoring';

const classify = (real: number, fake: number) => calculateRealityScore([
  { label: 'fake', score: fake }, { label: 'real', score: real },
]);

describe('reality score', () => {
  it('maps both extremes', () => {
    expect(classify(0, 1)).toBe(0);
    expect(classify(1, 0)).toBe(100);
  });
  it('normalizes real and fake confidence', () => {
    expect(classify(0.42, 0.58)).toBe(42);
    expect(classify(0.6, 0.4)).toBe(60);
    expect(classify(3, 2)).toBe(60);
  });
  it('uses 60 as the inclusive passing boundary', () => {
    expect(getVerdict(59)).toBe('suspected');
    expect(getVerdict(60)).toBe('passed');
  });
  it('keeps message bands consistent', () => {
    expect(getScoreLabel(39)).toBe('高度疑似 AI 生成');
    expect(getScoreLabel(59)).toBe('疑似 AI 生成');
    expect(getScoreLabel(60)).toBe('初步通过');
    expect(getScoreLabel(80)).toBe('模型倾向真实照片');
  });
  it('offers hundredth precision in advanced mode without changing basic rounded scores', () => {
    expect(calculateRealityScore([{ label: 'real', score: 0.68123 }, { label: 'fake', score: 0.31877 }], 2)).toBe(68.12);
    expect(classify(0.68123, 0.31877)).toBe(68);
  });
  it('rejects missing or invalid model classes (never invents a score)', () => {
    expect(() => calculateRealityScore([{ label: 'real', score: 1 }])).toThrow();
    expect(() => classify(Number.NaN, 0.5)).toThrow();
    expect(() => classify(0, 0)).toThrow();
  });
});
