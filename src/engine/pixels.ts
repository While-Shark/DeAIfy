import type { ProcessingParams } from '../types/editor';

function clamp(value: number): number {
  return Math.max(0, Math.min(255, value));
}

/** Fixed pseudo-random grain: slider changes never cause preview flickering. */
function grainNoise(x: number, y: number): number {
  let hash = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263);
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967295 - 0.5;
}

/** Conservative global edits. This does not regenerate anatomy or verify provenance. */
export function adjustPixels(data: Uint8ClampedArray, width: number, height: number, params: ProcessingParams): void {
  const original = data.slice();
  const amount = params.strength / 100;
  const contrast = 1 + (params.contrast / 100) * amount;
  const saturation = 1 + (params.saturation / 100) * amount;
  const warmth = params.warmth * amount * 0.45;
  const blur = (params.softness / 100) * amount * 0.36;
  const texture = (params.texture / 100) * amount * 0.52;
  const grain = params.grain * amount * 0.72;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (original[i + 3] === 0) continue;
      const left = (y * width + Math.max(0, x - 1)) * 4;
      const right = (y * width + Math.min(width - 1, x + 1)) * 4;
      const top = (Math.max(0, y - 1) * width + x) * 4;
      const bottom = (Math.min(height - 1, y + 1) * width + x) * 4;
      const luminance = 0.2126 * original[i]! + 0.7152 * original[i + 1]! + 0.0722 * original[i + 2]!;
      const noise = grainNoise(x, y) * grain;

      for (let channel = 0; channel < 3; channel++) {
        const input = original[i + channel]!;
        const neighbor = (original[left + channel]! + original[right + channel]!
          + original[top + channel]! + original[bottom + channel]!) / 4;
        const detail = input - neighbor;
        const softened = input - detail * blur + detail * texture;
        const desaturated = luminance + (softened - luminance) * saturation;
        const toned = (desaturated - 128) * contrast + 128;
        const temp = channel === 0 ? warmth : channel === 2 ? -warmth : 0;
        data[i + channel] = clamp(toned + temp + noise);
      }
    }
  }
}
