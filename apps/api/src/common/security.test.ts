import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, tokenHash } from './security.js';
describe('security', () => {
  it('encrypts authenticated secrets', () => {
    const key = Buffer.alloc(32, 7).toString('base64');
    const encrypted = encryptSecret('secret', key);
    expect(encrypted).not.toContain('secret');
    expect(decryptSecret(encrypted, key)).toBe('secret');
  });
  it('hashes tokens', () => expect(tokenHash('a')).toHaveLength(64));
});
