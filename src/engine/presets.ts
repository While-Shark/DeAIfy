import type { Preset, PresetId, PresetLevel, ProcessingParams } from '../types/editor';

export const PRESET_LEVELS: readonly { id: PresetLevel; label: string }[] = [
  { id: 'low', label: '低' }, { id: 'medium', label: '中' }, { id: 'high', label: '高' },
];
const FACTORS: Record<PresetLevel, number> = { low: 0.55, medium: 1, high: 1.3 };
const LIMITS: Record<keyof ProcessingParams, [number, number]> = {
  strength: [0, 100], grain: [0, 80], warmth: [-40, 40], saturation: [-40, 40],
  contrast: [-40, 40], softness: [0, 50], texture: [0, 60],
};

export const PRESETS: readonly Preset[] = [
  {
    id: 'natural', title: '自然摄影', subtitle: '克制色彩 · 细腻质感',
    params: { strength: 70, grain: 18, warmth: 3, saturation: -8, contrast: -4, softness: 8, texture: 10 },
  },
  {
    id: 'portrait', title: '真实人像', subtitle: '柔和肤色 · 减少锐利感',
    params: { strength: 68, grain: 12, warmth: 11, saturation: -5, contrast: -9, softness: 18, texture: 5 },
  },
  {
    id: 'film', title: '胶片质感', subtitle: '温暖颗粒 · 复古影调',
    params: { strength: 82, grain: 43, warmth: 12, saturation: -14, contrast: 8, softness: 6, texture: 8 },
  },
  {
    id: 'documentary', title: '纪实风格', subtitle: '中性色彩 · 保留细节',
    params: { strength: 77, grain: 26, warmth: -5, saturation: -17, contrast: 5, softness: 3, texture: 18 },
  },
  {
    id: 'softlight', title: '清透日常', subtitle: '柔和光影 · 自然通透',
    params: { strength: 72, grain: 16, warmth: 5, saturation: -3, contrast: -12, softness: 13, texture: 6 },
  },
];

export function getPreset(id: PresetId): Preset {
  return PRESETS.find((preset) => preset.id === id) ?? PRESETS[0]!;
}

/** Medium retains existing settings; other levels scale the entire effect. */
export function paramsForPreset(id: PresetId, level: PresetLevel): ProcessingParams {
  const base = getPreset(id).params;
  const result = {} as ProcessingParams;
  for (const key of Object.keys(LIMITS) as (keyof ProcessingParams)[]) {
    const [min, max] = LIMITS[key];
    result[key] = Math.max(min, Math.min(max, Math.round(base[key] * FACTORS[level])));
  }
  return result;
}

export function cloneParams(source: ProcessingParams): ProcessingParams {
  return { ...source };
}
