import { createDecipheriv } from 'node:crypto';
import { getEncoding } from 'js-tiktoken';

export type ModelUsage = { inputTokens: number; outputTokens: number };
export type ModelTool = {
  name: string;
  description: string;
  inputSchema: unknown;
};
export type ModelToolCall = { id: string; name: string; arguments: unknown };
export type GenerateInput = {
  model: string;
  messages: {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    name?: string;
    toolCallId?: string;
    toolCalls?: ModelToolCall[];
  }[];
  temperature: number;
  maxOutputTokens: number;
  tools?: ModelTool[];
  signal?: AbortSignal;
};
export type GenerateResult = { text: string; usage: ModelUsage; toolCalls?: ModelToolCall[] };
export type ModelInfo = { id: string; capabilities: string[] };
export type RerankCandidate = { id: string; content: string; score: number };
export interface Reranker {
  rerank(query: string, candidates: RerankCandidate[], topK: number): Promise<RerankCandidate[]>;
}
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
    const last = input.messages.at(-1);
    const prompt = input.messages.filter((message) => message.role === 'user').at(-1)?.content;
    if (input.tools?.length && last?.role !== 'tool') {
      const text = (prompt ?? '').toLowerCase();
      const selected = input.tools.find((tool) => {
        if (tool.name === 'current_time') return /time|时间/.test(text);
        if (tool.name === 'current_user') return /who am i|当前用户|我的信息/.test(text);
        if (tool.name === 'knowledge_search') return /资料|文档|知识|政策|knowledge/.test(text);
        if (tool.name === 'readonly_query_template')
          return /用量|token|成本|cost|usage|索引状态/.test(text);
        if (tool.name === 'create_support_ticket') return /工单|ticket/.test(text);
        if (tool.name === 'send_email') return /邮件|email/.test(text);
        if (tool.name === 'get_product') return /产品|sku|product/.test(text);
        if (tool.name === 'get_order_status') return /订单|order/.test(text);
        return false;
      });
      if (selected) {
        const argumentsValue = inferMockToolArguments(selected.name, prompt ?? '');
        return {
          text: '',
          usage: { inputTokens: Math.ceil((prompt ?? '').length / 4), outputTokens: 8 },
          toolCalls: [
            { id: `mock-${selected.name}`, name: selected.name, arguments: argumentsValue },
          ],
        };
      }
    }
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
          messages: serializeMessages(input.messages),
          temperature: input.temperature,
          max_tokens: input.maxOutputTokens,
          ...(input.tools?.length
            ? {
                tools: input.tools.map((tool) => ({
                  type: 'function',
                  function: {
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.inputSchema,
                  },
                })),
                tool_choice: 'auto',
              }
            : {}),
        },
        input.signal,
      )
    ).json()) as {
      choices: {
        message: {
          content: string | null;
          tool_calls?: {
            id: string;
            function: { name: string; arguments: string };
          }[];
        };
      }[];
      usage?: { prompt_tokens: number; completion_tokens: number };
    };
    const message = json.choices[0]?.message;
    return {
      text: message?.content ?? '',
      usage: {
        inputTokens: json.usage?.prompt_tokens ?? 0,
        outputTokens: json.usage?.completion_tokens ?? 0,
      },
      ...(message?.tool_calls?.length
        ? {
            toolCalls: message.tool_calls.map((call) => ({
              id: call.id,
              name: call.function.name,
              arguments: parseToolArguments(call.function.arguments),
            })),
          }
        : {}),
    };
  }
  async *stream(input: GenerateInput) {
    const response = await this.request(
      '/chat/completions',
      {
        model: input.model,
        messages: serializeMessages(input.messages),
        temperature: input.temperature,
        max_tokens: input.maxOutputTokens,
        stream: true,
      },
      input.signal,
    );
    if (!response.body) throw new Error('MODEL_STREAM_BODY_MISSING');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    while (true) {
      const { done, value } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        const event = JSON.parse(data) as {
          choices?: { delta?: { content?: string | null } }[];
        };
        const delta = event.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      }
      if (done) break;
    }
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

export type StoredProviderConfig = {
  providerType: string;
  baseUrl?: string | null;
  encryptedApiKey?: string | null;
};

export const decryptModelSecret = (value: string, keyBase64: string): string => {
  const [ivRaw, tagRaw, dataRaw] = value.split('.');
  if (!ivRaw || !tagRaw || !dataRaw) throw new Error('Invalid encrypted secret');
  const key = Buffer.from(keyBase64, 'base64');
  if (key.length !== 32) throw new Error('MODEL_ENCRYPTION_KEY must decode to 32 bytes');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataRaw, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
};

export const createProviderAdapter = (
  config: StoredProviderConfig,
  encryptionKey = process.env.MODEL_ENCRYPTION_KEY ?? '',
): ModelProviderAdapter => {
  if (config.providerType === 'mock') return new MockProvider();
  if (!config.encryptedApiKey) throw new Error('PROVIDER_API_KEY_MISSING');
  const apiKey = decryptModelSecret(config.encryptedApiKey, encryptionKey);
  if (config.providerType === 'openai') return new OpenAIProvider(apiKey);
  if (!config.baseUrl) throw new Error('PROVIDER_BASE_URL_MISSING');
  return new OpenAICompatibleProvider({ baseUrl: config.baseUrl, apiKey });
};

const parseToolArguments = (value: string): unknown => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return {};
  }
};

const serializeMessages = (messages: GenerateInput['messages']) =>
  messages.map((message) => {
    if (message.role === 'assistant' && message.toolCalls?.length) {
      return {
        role: message.role,
        content: message.content || null,
        tool_calls: message.toolCalls.map((call) => ({
          id: call.id,
          type: 'function',
          function: { name: call.name, arguments: JSON.stringify(call.arguments) },
        })),
      };
    }
    if (message.role === 'tool') {
      return {
        role: message.role,
        content: message.content,
        tool_call_id: message.toolCallId,
      };
    }
    return { role: message.role, content: message.content };
  });

const inferMockToolArguments = (name: string, prompt: string): unknown => {
  if (name === 'knowledge_search') return { query: prompt, knowledgeBaseIds: [] };
  if (name === 'readonly_query_template') {
    return {
      queryId: /索引状态|文档状态/.test(prompt) ? 'document_status' : 'usage_summary',
      params: {},
    };
  }
  if (name === 'create_support_ticket') {
    return {
      title: prompt.slice(0, 120) || '企业工单',
      description: prompt || '由 Agent 创建的工单',
      idempotencyKey: `mock-ticket-${hash(prompt)}`,
    };
  }
  if (name === 'send_email') {
    return {
      to: 'approver@example.com',
      subject: prompt.slice(0, 120) || 'Agent 邮件',
      body: prompt || '由 Agent 准备的邮件',
      idempotencyKey: `mock-email-${hash(prompt)}`,
    };
  }
  if (name === 'get_product') {
    return { sku: prompt.match(/[A-Z]+-[A-Z0-9-]+/i)?.[0] ?? 'DEMO-001' };
  }
  if (name === 'get_order_status') {
    return { orderNumber: prompt.match(/ORDER-[A-Z0-9-]+/i)?.[0] ?? 'ORDER-DEMO-001' };
  }
  return {};
};
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
  const encoder = getEncoding('cl100k_base');
  const out: Chunk[] = [];
  let buffer: number[] = [];
  let heading: string | null = null;
  let page: number | null = null;
  let start = 0;
  const overlap = Math.min(config.overlapTokens, Math.max(config.chunkTokens - 1, 0));
  const push = (tokens: number[]) => {
    const content = encoder.decode(tokens).trim();
    if (!content) return;
    out.push({
      content,
      tokenCount: tokens.length,
      heading,
      pageNumber: page,
      paragraphNumber: start,
    });
  };
  paragraphs.forEach((p, i) => {
    if (!buffer.length) start = i;
    if (p.heading) heading = p.heading;
    if (p.pageNumber !== undefined) page = p.pageNumber;
    buffer.push(...encoder.encode(`${buffer.length ? '\n\n' : ''}${p.text}`));
    while (buffer.length > config.chunkTokens) {
      push(buffer.slice(0, config.chunkTokens));
      buffer = buffer.slice(config.chunkTokens - overlap);
      start = i;
    }
  });
  if (buffer.length >= config.minChunkTokens || out.length === 0) push(buffer);
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
