import { describe, expect, it } from 'vitest';
import { evaluateRecords } from './evaluation';
import type { EvaluationRecord } from '../types/editor';

const item = (label: 'real' | 'ai', primary: number | null, secondary: number | null = null): EvaluationRecord => ({
  label, primary, secondary, name: 'sample.png', createdAt: 1,
});
describe('user-labeled offline evaluation', () => {
  it('counts AI detection errors correctly at threshold 60', () => {
    const result = evaluateRecords([item('ai', 15), item('ai', 75), item('real', 48), item('real', 90)], 'primary');
    expect(result.correct).toBe(2);
    expect(result.accuracy).toBe(50);
    expect(result.falseNegativeRate).toBe(50);
    expect(result.falsePositiveRate).toBe(50);
  });
  it('excludes models that were not run from accuracy', () => {
    const result = evaluateRecords([item('ai', 20), item('real', 90)], 'secondary');
    expect(result.classified).toBe(0);
    expect(result.accuracy).toBeNull();
  });
});
