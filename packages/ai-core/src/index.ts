export type ModelUsage = { inputTokens: number; outputTokens: number };
export type GenerateInput = {
  model: string;
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  temperature: number;
  maxOutputTokens: number;
  signal?: AbortSignal;
};
export type GenerateResult = { text: string; usage: ModelUsage };
export type ModelInfo = { id: string; capabilities: string[] };
export interface ModelProviderAdapter {
  listModels(): Promise<ModelInfo[]>;
  generate(input: GenerateInput): Promise<GenerateResult>;
  stream(input: GenerateInput): AsyncIterable<string>;
  embed(model: string, texts: string[]): Promise<number[][]>;
  healthCheck(): Promise<boolean>;
  estimateCost(
    inputTokens: number,
    outputTokens: number,
    inputPrice: number,
    outputPrice: number,
  ): number;
}
const hash = (text: string): number => {
  let value = 2166136261;
  for (const char of text) {
    value ^= char.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
};
export class MockProvider implements ModelProviderAdapter {
  async listModels() {
    return [{ id: 'mock-chat', capabilities: ['chat', 'embedding'] }];
  }
  async generate(input: GenerateInput) {
    const text = '根据企业知识库资料，这是一个可验证的回答。';
    return {
      text,
      usage: {
        inputTokens: Math.ceil(input.messages.map((x) => x.content).join('').length / 4),
        outputTokens: Math.ceil(text.length / 2),
      },
    };
  }
  async *stream(input: GenerateInput) {
    const result = await this.generate(input);
    for (const char of result.text) yield char;
  }
  async embed(_model: string, texts: string[]) {
    return texts.map((text) => {
      const vector = Array.from({ length: 1536 }, () => 0);
      for (const token of text
        .toLowerCase()
        .split(/\s+|(?=[\u4e00-\u9fff])|(?<=[\u4e00-\u9fff])/)
        .filter(Boolean)) {
        const i = hash(token) % 1536;
        vector[i] = (vector[i] ?? 0) + 1;
      }
      const norm = Math.sqrt(vector.reduce((sum, x) => sum + x * x, 0)) || 1;
      return vector.map((x) => x / norm);
    });
  }
  async healthCheck() {
    return true;
  }
  estimateCost(inputTokens: number, outputTokens: number, inputPrice: number, outputPrice: number) {
    return (inputTokens / 1_000_000) * inputPrice + (outputTokens / 1_000_000) * outputPrice;
  }
}
type CompatibleOptions = {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
  maxRetries?: number;
};
export class OpenAICompatibleProvider implements ModelProviderAdapter {
  constructor(private readonly options: CompatibleOptions) {}
  private async request(path: string, body?: unknown, signal?: AbortSignal): Promise<Response> {
    const retries = this.options.maxRetries ?? 2;
    let last: Error | undefined;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const timeout = AbortSignal.timeout(this.options.timeoutMs ?? 30000);
      const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
      try {
        const init: RequestInit = {
          method: body ? 'POST' : 'GET',
          headers: {
            Authorization: `Bearer ${this.options.apiKey}`,
            'Content-Type': 'application/json',
          },
          signal: combined,
        };
        if (body) init.body = JSON.stringify(body);
        const response = await fetch(`${this.options.baseUrl.replace(/\/$/, '')}${path}`, init);
        if (response.ok) return response;
        if (![408, 429, 500, 502, 503, 504].includes(response.status))
          throw new Error(`MODEL_HTTP_${response.status}`);
        last = new Error(`MODEL_RETRYABLE_${response.status}`);
      } catch (error) {
        last = error instanceof Error ? error : new Error('MODEL_REQUEST_FAILED');
        if (attempt === retries || signal?.aborted) throw last;
      }
      await new Promise((resolve) => setTimeout(resolve, Math.min(250 * 2 ** attempt, 2000)));
    }
    throw last ?? new Error('MODEL_REQUEST_FAILED');
  }
  async listModels() {
    const json = (await (await this.request('/models')).json()) as { data: { id: string }[] };
    return json.data.map((x) => ({ id: x.id, capabilities: ['chat', 'embedding'] }));
  }
  async generate(input: GenerateInput) {
    const json = (await (
      await this.request(
        '/chat/completions',
        {
          model: input.model,
          messages: input.messages,
          temperature: input.temperature,
          max_tokens: input.maxOutputTokens,
        },
        input.signal,
      )
    ).json()) as {
      choices: { message: { content: string } }[];
      usage?: { prompt_tokens: number; completion_tokens: number };
    };
    return {
      text: json.choices[0]?.message.content ?? '',
      usage: {
        inputTokens: json.usage?.prompt_tokens ?? 0,
        outputTokens: json.usage?.completion_tokens ?? 0,
      },
    };
  }
  async *stream(input: GenerateInput) {
    const result = await this.generate(input);
    yield result.text;
  }
  async embed(model: string, texts: string[]) {
    const json = (await (await this.request('/embeddings', { model, input: texts })).json()) as {
      data: { embedding: number[] }[];
    };
    return json.data.map((x) => x.embedding);
  }
  async healthCheck() {
    try {
      await this.listModels();
      return true;
    } catch {
      return false;
    }
  }
  estimateCost(inputTokens: number, outputTokens: number, inputPrice: number, outputPrice: number) {
    return (inputTokens / 1_000_000) * inputPrice + (outputTokens / 1_000_000) * outputPrice;
  }
}
export class OpenAIProvider extends OpenAICompatibleProvider {
  constructor(apiKey: string, timeoutMs?: number) {
    super({
      baseUrl: 'https://api.openai.com/v1',
      apiKey,
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
    });
  }
}
export type Chunk = {
  content: string;
  tokenCount: number;
  heading: string | null;
  pageNumber: number | null;
  paragraphNumber: number;
};
export const chunkText = (
  paragraphs: { text: string; heading?: string; pageNumber?: number }[],
  config = { chunkTokens: 800, overlapTokens: 120, minChunkTokens: 80 },
): Chunk[] => {
  const estimate = (s: string) => Math.ceil(s.length / 3);
  const out: Chunk[] = [];
  let buffer = '';
  let heading: string | null = null;
  let page: number | null = null;
  let start = 0;
  const flush = () => {
    if (!buffer.trim()) return;
    out.push({
      content: buffer.trim(),
      tokenCount: estimate(buffer),
      heading,
      pageNumber: page,
      paragraphNumber: start,
    });
    const overlapChars = config.overlapTokens * 3;
    buffer = buffer.slice(-overlapChars);
  };
  paragraphs.forEach((p, i) => {
    if (!buffer) start = i;
    if (p.heading) heading = p.heading;
    if (p.pageNumber !== undefined) page = p.pageNumber;
    if (estimate(buffer) + estimate(p.text) > config.chunkTokens) flush();
    buffer += `${buffer ? '\n\n' : ''}${p.text}`;
  });
  if (estimate(buffer) >= config.minChunkTokens || out.length === 0) flush();
  return out;
};
export const reciprocalRankFusion = (
  vectorIds: string[],
  keywordIds: string[],
  k = 60,
): Map<string, number> => {
  const scores = new Map<string, number>();
  for (const list of [vectorIds, keywordIds])
    list.forEach((id, index) => scores.set(id, (scores.get(id) ?? 0) + 1 / (k + index + 1)));
  return scores;
};
