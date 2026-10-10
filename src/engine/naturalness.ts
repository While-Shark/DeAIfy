import type { NaturalnessMetrics } from '../types/editor';

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

/**
 * Explainable photographic texture diagnostics. This is NOT an AI-origin classifier.
 * The index is heuristic, useful for comparing the same image before and after editing.
 */
export function analyzeNaturalness(rgba: Uint8ClampedArray, width: number, height: number): NaturalnessMetrics {
  if (width < 3 || height < 3 || rgba.length < width * height * 4) throw new Error('Invalid analysis image');
  let count = 0;
  let clipped = 0;
  let saturation = 0;
  let variation = 0;
  let edgeCount = 0;
  const step = Math.max(1, Math.floor(Math.min(width, height) / 300));
  const lum = (i: number) => 0.2126 * rgba[i]! + 0.7152 * rgba[i + 1]! + 0.0722 * rgba[i + 2]!;
  for (let y = step; y < height - step; y += step) {
    for (let x = step; x < width - step; x += step) {
      const i = (y * width + x) * 4;
      if (rgba[i + 3]! < 240) continue;
      count++;
      const r = rgba[i]!, g = rgba[i + 1]!, b = rgba[i + 2]!;
      const hi = Math.max(r, g, b), lo = Math.min(r, g, b);
      const bright = lum(i);
      if (bright > 249 || bright < 6) clipped++;
      saturation += hi > 0 ? (hi - lo) / hi : 0;
      const dx = Math.abs(bright - lum(i + 4 * step));
      const dy = Math.abs(bright - lum(i + 4 * width * step));
      variation += Math.min(255, dx + dy);
      if (dx + dy > 26) edgeCount++;
    }
  }
  if (!count) return { index: 0, clippedPercent: 0, averageSaturation: 0, textureIndex: 0, notes: ['无法分析透明图像'] };
  const clippedPercent = clamp(clipped / count * 100);
  const averageSaturation = clamp(saturation / count * 100);
  const textureIndex = clamp(variation / count / 0.6);
  const edgeRatio = edgeCount / count * 100;
  // Penalties are intentionally bounded so photographic styles are not labeled as AI.
  const clippingPenalty = Math.min(30, clippedPercent * 1.1);
  const flatnessPenalty = Math.max(0, 12 - textureIndex * 0.6);
  const saturationPenalty = Math.max(0, averageSaturation - 55) * 0.25;
  const excessiveEdges = Math.max(0, edgeRatio - 40) * 0.2;
  const index = Math.round(clamp(100 - clippingPenalty - flatnessPenalty - saturationPenalty - excessiveEdges) * 100) / 100;
  const notes: string[] = [];
  if (clippedPercent > 5) notes.push('画面存在较多高光或暗部裁切');
  if (textureIndex < 13) notes.push('局部变化较少，可能存在过度平滑');
  if (averageSaturation > 55) notes.push('整体饱和度偏高');
  if (edgeRatio > 45) notes.push('局部边缘较强，建议检查锐化效果');
  if (!notes.length) notes.push('未发现明显的全局色彩或纹理异常');
  return {
    index, clippedPercent: Math.round(clippedPercent * 100) / 100,
    averageSaturation: Math.round(averageSaturation * 100) / 100,
    textureIndex: Math.round(textureIndex * 100) / 100, notes,
  };
}
