import { describe, expect, it } from 'vitest';
import { validProjectName } from '../src/apiKeys.js';

describe('external API key validation', () => {
  it('accepts concise project names', () => {
    expect(validProjectName('IdeaWeave')).toBe(true);
    expect(validProjectName('my-project_01')).toBe(true);
  });
  it('rejects HTML, empty or oversized project names', () => {
    expect(validProjectName('<img src=x>')).toBe(false);
    expect(validProjectName('')).toBe(false);
    expect(validProjectName('x'.repeat(65))).toBe(false);
  });
});
