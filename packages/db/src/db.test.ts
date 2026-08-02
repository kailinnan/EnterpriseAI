import { describe, expect, it } from 'vitest';
describe('database package', () => {
  it('keeps tenant-scoped schema migration', async () => {
    const migration = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('../migrations/0001_initial.sql', import.meta.url), 'utf8'),
    );
    expect(migration).toContain('tenant_id');
    expect(migration).toContain('USING hnsw');
  });
});
