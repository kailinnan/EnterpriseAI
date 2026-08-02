import { describe, expect, it } from 'vitest';
import { parseDocument } from './parser.js';
describe('parsers', () => {
  it('parses markdown headings', async () => {
    const result = await parseDocument(Buffer.from('# Title\n\nBody text'), 'text/markdown');
    expect(result[0]?.heading).toBe('Title');
    expect(result[1]?.text).toBe('Body text');
  });
  it('parses html without scripts', async () => {
    const result = await parseDocument(
      Buffer.from('<h1>A</h1><p>B</p><script>bad</script>'),
      'text/html',
    );
    expect(result.map((x) => x.text)).toEqual(['A', 'B']);
  });
});
