import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('portable plan seed encoding', () => {
  const schema = readFileSync(new URL('../sql/schema.sql', import.meta.url), 'utf8');
  const plans = [
    ['plan-starter', '体验包'],
    ['plan-creator', '创作者包'],
    ['plan-pro', '专业包'],
    ['plan-studio', '工作室包'],
  ];
  it('uses byte-accurate utf8mb4 seed strings independently of the SQL client charset', () => {
    for (const [id, title] of plans) {
      const hex = Buffer.from(title, 'utf8').toString('hex').toUpperCase();
      expect(schema).toContain("('" + id + "',CONVERT(0x" + hex + ' USING utf8mb4)');
    }
  });
  it('repairs only exact known corrupted seed strings, never customized plan names', () => {
    for (const [id] of plans) {
      expect(schema).toContain("WHERE id='" + id + "' AND HEX(title)='");
    }
  });
});
