import mammoth from 'mammoth';
import { load } from 'cheerio';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
export type Paragraph = { text: string; heading?: string; pageNumber?: number };
export const parseDocument = async (buffer: Buffer, mime: string): Promise<Paragraph[]> => {
  if (mime === 'application/pdf') {
    const pdf = await getDocument({ data: new Uint8Array(buffer) }).promise;
    const out: Paragraph[] = [];
    for (let page = 1; page <= pdf.numPages; page++) {
      const content = await (await pdf.getPage(page)).getTextContent();
      const text = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      for (const p of text.split(/\n{2,}/).filter(Boolean)) out.push({ text: p, pageNumber: page });
    }
    return out;
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
    const text = $(el).text().replace(/\s+/g, ' ').trim();
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
    .map((x) => x.trim())
    .filter(Boolean)
    .map((text) => {
      if (markdown && /^#{1,6}\s/.test(text)) heading = text.replace(/^#+\s*/, '');
      return heading ? { text, heading } : { text };
    });
};
