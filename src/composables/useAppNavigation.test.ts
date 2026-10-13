import { describe, expect, it } from 'vitest';
import { viewFromPath } from './useAppNavigation';

describe('docs route selection', () => {
  it('accepts direct and trailing-slash docs links', () => {
    expect(viewFromPath('/docs')).toBe('docs');
    expect(viewFromPath('/docs/')).toBe('docs');
  });
  it('keeps other locations in the studio', () => {
    expect(viewFromPath('/')).toBe('studio');
    expect(viewFromPath('/docs-other')).toBe('studio');
  });
});
