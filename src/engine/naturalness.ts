import type { NaturalnessMetrics, QualityDimensions } from '../types/editor';

const clamp = (value: number): number => Math.min(100, Math.max(0, value));
const round = (value: number): number => Math.round(clamp(value) * 10) / 10;

/**
 * Four explainable image-quality heuristics, not AI-likelihood estimates.
 * Compare similar scenes (preferably the source and its edited copy).
 */
export function analyzeNaturalness(rgba: Uint8ClampedArray, width: number, height: number): NaturalnessMetrics {
  if (width < 3 || height < 3 || rgba.length < width * height * 4) {
    throw new Error('Invalid analysis image');
  }
  const step = Math.max(1, Math.floor(Math.min(width, height) / 300));
  const luminance = (i: number): number =>
    0.2126 * rgba[i]! + 0.7152 * rgba[i + 1]! + 0.0722 * rgba[i + 2]!;
  let count = 0;
  let clipped = 0;
  let summedSaturation = 0;
  let summedVariation = 0;
  let strongEdges = 0;
  let summedLuma = 0;

  for (let y = step; y < height - step; y += step) {
    for (let x = step; x < width - step; x += step) {
      const i = (y * width + x) * 4;
      if (rgba[i + 3]! < 240) continue;
      const r = rgba[i]!, g = rgba[i + 1]!, b = rgba[i + 2]!;
      const high = Math.max(r, g, b);
      const low = Math.min(r, g, b);
      const bright = luminance(i);
      const variation = Math.abs(bright - luminance(i + 4 * step))
        + Math.abs(bright - luminance(i + 4 * width * step));
      count++;
      summedLuma += bright;
      if (bright < 6 || bright > 249) clipped++;
      summedSaturation += high > 0 ? (high - low) / high : 0;
      summedVariation += Math.min(255, variation);
      if (variation > 26) strongEdges++;
    }
  }

  if (count === 0) {
    throw new Error('透明图像缺少足够的不透明像素，无法计算画质指标');
  }

  const clippedPercent = clipped / count * 100;
  const averageSaturation = summedSaturation / count * 100;
  const textureIndex = clamp(summedVariation / count / 0.6);
  const edgeRatio = strongEdges / count * 100;
  const lumaMean = summedLuma / count;

  const dimensions: QualityDimensions = {
    // Soft limits avoid judging intentionally dramatic photographs as synthetic.
    exposure: round(100 - clippedPercent * 1.8 - Math.max(0, Math.abs(lumaMean - 128) - 82) * 0.12),
    color: round(100 - Math.max(0, averageSaturation - 42) * 0.75),
    texture: round(100 - Math.max(0, 15 - textureIndex) * 1.6 - Math.max(0, textureIndex - 68) * 0.6),
    edges: round(100 - Math.max(0, edgeRatio - 38) * 0.8 - Math.max(0, 3 - edgeRatio) * 1.4),
  };
  const index = round(
    dimensions.exposure * 0.3 + dimensions.color * 0.25
    + dimensions.texture * 0.25 + dimensions.edges * 0.2,
  );
  const notes: string[] = [];
  if (clippedPercent > 5) notes.push('高光或暗部裁切较明显');
  if (textureIndex < 13) notes.push('局部变化偏少，可能过度平滑，也可能是简单背景');
  if (textureIndex > 68) notes.push('高频纹理较密，建议检查噪点');
  if (averageSaturation > 55) notes.push('整体色彩偏浓');
  if (edgeRatio > 45) notes.push('边缘较强，建议检查锐化');
  if (notes.length === 0) notes.push('未发现突出的全局色彩、曝光或纹理异常');

  return {
    index,
    clippedPercent: round(clippedPercent),
    averageSaturation: round(averageSaturation),
    textureIndex: round(textureIndex),
    edgeRatio: round(edgeRatio),
    dimensions,
    notes,
  };
}
