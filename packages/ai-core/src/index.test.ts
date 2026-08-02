import { describe, expect, it } from 'vitest';
import { chunkText, MockProvider, reciprocalRankFusion } from './index.js';
describe('ai core', () => {
  it('mock embeddings are deterministic', async () => {
    const p = new MockProvider();
    expect(await p.embed('x', ['企业知识'])).toEqual(await p.embed('x', ['企业知识']));
  });
  it('chunks within budget', () => {
    const chunks = chunkText([{ text: 'a'.repeat(100) }, { text: 'b'.repeat(100) }], {
      chunkTokens: 40,
      overlapTokens: 5,
      minChunkTokens: 1,
    });
    expect(chunks.length).toBeGreaterThan(1);
  });
  it('RRF rewards common results', () => {
    const s = reciprocalRankFusion(['a', 'b'], ['b', 'c']);
    expect(s.get('b') ?? 0).toBeGreaterThan(s.get('a') ?? 0);
  });
});
