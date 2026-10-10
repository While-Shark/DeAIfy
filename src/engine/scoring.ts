import type { Prediction } from '../types/editor';

/** An uncalibrated classifier threshold, not a statistical probability. */
export const PASS_SCORE = 60;

export function calculateRealityScore(predictions: Prediction[], digits: 0 | 2 = 2): number {
  const real = predictions.find((item) => item.label.trim().toLowerCase() === 'real');
  const fake = predictions.find((item) => item.label.trim().toLowerCase() === 'fake');
  if (!real || !fake || !Number.isFinite(real.score) || !Number.isFinite(fake.score)
    || real.score < 0 || fake.score < 0 || real.score + fake.score <= 0) {
    throw new Error('模型没有返回有效的 real / fake 双类别结果。');
  }
  const raw = real.score / (real.score + fake.score) * 100;
  const multiplier = digits === 2 ? 100 : 1;
  return Math.max(0, Math.min(100, Math.round(raw * multiplier) / multiplier));
}

export function getVerdict(score: number): 'suspected' | 'passed' {
  return score < PASS_SCORE ? 'suspected' : 'passed';
}

export function getScoreLabel(score: number): string {
  if (score < 40) return '高度疑似 AI 生成';
  if (score < PASS_SCORE) return '疑似 AI 生成';
  if (score < 80) return '初步通过';
  return '模型倾向真实照片';
}
