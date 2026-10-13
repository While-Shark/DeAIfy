import { describe, expect, it } from 'vitest';
import { paramsForPreset, PRESETS, PRESET_LEVELS } from '../engine/presets';
import { DOWNLOAD_CURL_EXAMPLE, EXAMPLE_LANGUAGES, processingExample } from './examples';

describe('HTTP API integration examples', () => {
  it('contains all required upload headers and parameters for each language', () => {
    for (const preset of PRESETS) {
      for (const level of PRESET_LEVELS) {
        const params = paramsForPreset(preset.id, level.id);
        for (const { id } of EXAMPLE_LANGUAGES) {
          const sample = processingExample(id, params);
          expect(sample).toContain('/api/process');
          expect(sample).toContain('Idempotency-Key');
          expect(sample).toContain('image/jpeg');
          expect(sample).toContain('strength');
          expect(sample).toContain(String(params.strength));
        }
      }
    }
  });
  it('includes secure download and avoids embedding a real key', () => {
    expect(DOWNLOAD_CURL_EXAMPLE).toContain('/api/jobs/JOB_ID/download');
    expect(DOWNLOAD_CURL_EXAMPLE).toContain('Authorization');
    expect(processingExample('curl', paramsForPreset('natural', 'medium')))
      .toContain('"strength":70');
    expect(processingExample('curl', paramsForPreset('natural', 'medium')))
      .not.toContain('dak_');
  });
});
