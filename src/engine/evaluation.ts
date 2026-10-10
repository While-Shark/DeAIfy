import type { EvaluationRecord } from '../types/editor';

export interface ConfusionMatrix {
  total: number;
  classified: number;
  correct: number;
  aiTruePositive: number;
  aiFalseNegative: number;
  realFalsePositive: number;
  realTrueNegative: number;
  accuracy: number | null;
  falsePositiveRate: number | null;
  falseNegativeRate: number | null;
}

/** At score < 60, predict AI; evaluation labels are user-supplied ground truth. */
export function evaluateRecords(records: readonly EvaluationRecord[], model: 'primary' | 'secondary'): ConfusionMatrix {
  let aiTruePositive = 0, aiFalseNegative = 0, realFalsePositive = 0, realTrueNegative = 0;
  for (const record of records) {
    const value = record[model];
    if (value === null || !Number.isFinite(value) || value < 0 || value > 100) continue;
    if (record.label === 'ai') {
      if (value < 60) aiTruePositive++; else aiFalseNegative++;
    } else if (value < 60) realFalsePositive++; else realTrueNegative++;
  }
  const classified = aiTruePositive + aiFalseNegative + realFalsePositive + realTrueNegative;
  const real = realFalsePositive + realTrueNegative;
  const ai = aiTruePositive + aiFalseNegative;
  const round = (value: number) => Math.round(value * 10000) / 100;
  return {
    total: records.length, classified,
    correct: aiTruePositive + realTrueNegative,
    aiTruePositive, aiFalseNegative, realFalsePositive, realTrueNegative,
    accuracy: classified ? round((aiTruePositive + realTrueNegative) / classified) : null,
    falsePositiveRate: real ? round(realFalsePositive / real) : null,
    falseNegativeRate: ai ? round(aiFalseNegative / ai) : null,
  };
}
