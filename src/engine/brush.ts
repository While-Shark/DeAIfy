import type { BrushStroke } from '../types/editor';

/** CPU fallback for user-defined local adjustments. Alpha and coordinates are preserved. */
export function applyBrushStrokes(pixels: Uint8ClampedArray, width: number, height: number, strokes: readonly BrushStroke[]): void {
  const shortSide = Math.min(width, height);
  for (const s of strokes) {
    if (!Number.isFinite(s.x) || !Number.isFinite(s.y) || !Number.isFinite(s.radius) || !Number.isFinite(s.amount)) continue;
    const r = Math.max(1, Math.min(shortSide / 3, s.radius * shortSide));
    const cx = s.x * width;
    const cy = s.y * height;
    const amp = Math.max(0, Math.min(1, s.amount));
    if (amp === 0) continue;
    const x0 = Math.max(0, Math.floor(cx - r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const x1 = Math.min(width - 1, Math.ceil(cx + r));
    const y1 = Math.min(height - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
        if (d >= 1) continue;
        const i = (y * width + x) * 4;
        if (pixels[i + 3] === 0) continue;
        const k = (1 - d) ** 2 * amp;
        const red = pixels[i]!;
        const green = pixels[i + 1]!;
        const blue = pixels[i + 2]!;
        switch (s.tool) {
          case 'lighten':
            pixels[i] = red + 35 * k;
            pixels[i + 1] = green + 35 * k;
            pixels[i + 2] = blue + 35 * k;
            break;
          case 'darken':
            pixels[i] = red - 35 * k;
            pixels[i + 1] = green - 35 * k;
            pixels[i + 2] = blue - 35 * k;
            break;
          case 'warm':
            pixels[i] = red + 30 * k;
            pixels[i + 2] = blue - 24 * k;
            break;
          case 'detail': {
            const luma = (red + green + blue) / 3;
            pixels[i] = red + (red - luma) * k * 0.35;
            pixels[i + 1] = green + (green - luma) * k * 0.35;
            pixels[i + 2] = blue + (blue - luma) * k * 0.35;
            break;
          }
        }
      }
    }
  }
}
