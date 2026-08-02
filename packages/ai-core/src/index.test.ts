import { describe, expect, it } from 'vitest';
import { chunkText, MockProvider, reciprocalRankFusion } from './index.js';
describe('ai core', () => {
  it('mock embeddings are deterministic', async () => {
    const p = new MockProvider();
    expect(await p.embed('x', ['企业知识'])).toEqual(await p.embed('x', ['企业知识']));
  });
  it('chunks within budget', () => {
    const chunks = chunkText(
      [{ text: 'enterprise knowledge '.repeat(100) }, { text: 'business document '.repeat(100) }],
      {
        chunkTokens: 40,
        overlapTokens: 5,
        minChunkTokens: 1,
      },
    );
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.tokenCount <= 40)).toBe(true);
  });
  it('returns deterministic native tool calls in mock mode', async () => {
    const provider = new MockProvider();
    const result = await provider.generate({
      model: 'mock-chat',
      messages: [{ role: 'user', content: '现在几点，查询服务器时间' }],
      temperature: 0,
      maxOutputTokens: 100,
      tools: [{ name: 'current_time', description: 'time', inputSchema: { type: 'object' } }],
    });
    expect(result.toolCalls?.[0]).toMatchObject({ name: 'current_time', arguments: {} });
  });
  it('RRF rewards common results', () => {
    const s = reciprocalRankFusion(['a', 'b'], ['b', 'c']);
    expect(s.get('b') ?? 0).toBeGreaterThan(s.get('a') ?? 0);
  });
});
