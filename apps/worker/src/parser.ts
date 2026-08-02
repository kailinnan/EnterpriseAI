import mammoth from 'mammoth';
import { load } from 'cheerio';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
export type Paragraph = { text: string; heading?: string; pageNumber?: number };
export const parseDocument = async (buffer: Buffer, mime: string): Promise<Paragraph[]> => {
  if (mime === 'application/pdf') {
    const pdf = await getDocument({ data: new Uint8Array(buffer) }).promise;
    const pages: { pageNumber: number; lines: string[] }[] = [];
    for (let page = 1; page <= pdf.numPages; page++) {
      const content = await (await pdf.getPage(page)).getTextContent();
      const rows = new Map<number, string[]>();
      for (const item of content.items) {
        if (!('str' in item) || !item.str.trim()) continue;
        const transform = 'transform' in item ? item.transform : undefined;
        const y = Math.round(Number(transform?.[5] ?? rows.size) / 2) * 2;
        rows.set(y, [...(rows.get(y) ?? []), item.str]);
      }
      const lines = [...rows.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([, parts]) => cleanText(parts.join(' ')))
        .filter(Boolean);
      pages.push({ pageNumber: page, lines });
    }
    const edgeCounts = new Map<string, number>();
    for (const page of pages)
      for (const line of [page.lines[0], page.lines.at(-1)])
        if (line) edgeCounts.set(line, (edgeCounts.get(line) ?? 0) + 1);
    return pages.flatMap((page) =>
      page.lines
        .filter((line, index) => {
          const atEdge = index === 0 || index === page.lines.length - 1;
          return !atEdge || pages.length < 2 || (edgeCounts.get(line) ?? 0) < 2;
        })
        .map((text) => ({ text, pageNumber: page.pageNumber })),
    );
  }
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const result = await mammoth.convertToHtml({ buffer });
    return parseHtml(result.value);
  }
  const text = buffer.toString('utf8');
  if (mime === 'text/html') return parseHtml(text);
  return parsePlain(text, mime === 'text/markdown');
};
const parseHtml = (html: string): Paragraph[] => {
  const $ = load(html);
  $('script,style,noscript').remove();
  const out: Paragraph[] = [];
  let heading: string | undefined;
  $('h1,h2,h3,h4,h5,h6,p,li,pre,table').each((_i, el) => {
    const tag = el.tagName.toLowerCase();
    if (tag !== 'table' && $(el).parents('table').length) return;
    const text = cleanText($(el).text());
    if (!text) return;
    if (/^h[1-6]$/.test(tag)) {
      heading = text;
      out.push({ text, heading });
    } else out.push(heading ? { text, heading } : { text });
  });
  return out;
};
const parsePlain = (text: string, markdown: boolean): Paragraph[] => {
  let heading: string | undefined;
  return text
    .replace(/\r/g, '')
    .split(/\n{2,}/)
    .map(cleanText)
    .filter(Boolean)
    .map((text) => {
      if (markdown && /^#{1,6}\s/.test(text)) heading = text.replace(/^#+\s*/, '');
      return heading ? { text, heading } : { text };
    });
};

const cleanText = (text: string): string =>
  [...text]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code > 31 || code === 9 || code === 10 || code === 13;
    })
    .join('')
    .replace(/[ \t]+/g, ' ')
    .trim();
