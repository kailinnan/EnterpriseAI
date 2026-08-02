import { BadRequestException, Injectable } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { z } from 'zod';
import { db, toJsonValue } from '@hub/db';
import { ToolRegistry, structuredToolError } from '@hub/tool-sdk';
import type { Principal } from '../common/auth.js';
import { RetrievalService } from './retrieval.service.js';
export const isPrivateAddress = (ip: string) =>
  /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd|fe80)/i.test(ip);
@Injectable()
export class ToolService {
  readonly registry = new ToolRegistry();
  constructor(private readonly retrieval: RetrievalService) {
    this.registry.register({
      name: 'current_user',
      description: 'Return current authenticated user',
      inputSchema: z.object({}),
      outputSchema: z.object({ userId: z.string(), tenantId: z.string() }),
      permissions: [],
      sideEffectLevel: 'none',
      timeoutMs: 1000,
      execute: async (ctx) => ({ userId: ctx.userId, tenantId: ctx.tenantId }),
    });
    this.registry.register({
      name: 'current_time',
      description: 'Return server UTC time',
      inputSchema: z.object({}),
      outputSchema: z.object({ iso: z.string() }),
      permissions: [],
      sideEffectLevel: 'none',
      timeoutMs: 1000,
      execute: async () => ({ iso: new Date().toISOString() }),
    });
    this.registry.register({
      name: 'knowledge_search',
      description: 'Search tenant knowledge bases',
      inputSchema: z.object({
        knowledgeBaseIds: z.array(z.uuid()).min(1),
        query: z.string().min(1),
        topK: z.number().int().min(1).max(20).default(8),
      }),
      outputSchema: z.object({
        results: z.array(
          z.object({
            chunkId: z.string(),
            documentId: z.string(),
            content: z.string(),
            score: z.number(),
          }),
        ),
      }),
      permissions: ['knowledge:read'],
      sideEffectLevel: 'none',
      timeoutMs: 15000,
      execute: async (ctx, input) => {
        const p: Principal = {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          email: 'tool@local',
          role: 'member',
        };
        const rows = await this.retrieval.search(p, input);
        return {
          results: rows.map((x) => ({
            chunkId: x.chunkId,
            documentId: x.documentId,
            content: x.content,
            score: x.finalScore,
          })),
        };
      },
    });
    this.registry.register({
      name: 'readonly_query_template',
      description: 'Run a predefined read-only query',
      inputSchema: z.object({
        queryId: z.enum(['usage_summary', 'document_status']),
        params: z.record(z.string(), z.string()).default({}),
      }),
      outputSchema: z.object({ rows: z.array(z.record(z.string(), z.unknown())) }),
      permissions: ['data:read'],
      sideEffectLevel: 'none',
      timeoutMs: 5000,
      execute: async (ctx, input) => {
        if (input.queryId === 'usage_summary') {
          const rows =
            await db()`select model_name,sum(input_tokens+output_tokens+embedding_tokens)::text tokens from usage_records where tenant_id=${ctx.tenantId} group by model_name`;
          return { rows: rows as Record<string, unknown>[] };
        }
        const rows =
          await db()`select parse_status,index_status,count(*)::text count from documents where tenant_id=${ctx.tenantId} group by parse_status,index_status`;
        return { rows: rows as Record<string, unknown>[] };
      },
    });
    this.registry.register({
      name: 'http_request_whitelist',
      description: 'GET a configured public HTTPS endpoint',
      inputSchema: z.object({
        url: z.url(),
        maxBytes: z.number().int().min(1).max(262144).default(65536),
      }),
      outputSchema: z.object({ status: z.number(), body: z.string() }),
      permissions: ['http:read'],
      sideEffectLevel: 'none',
      timeoutMs: 10000,
      execute: async (ctx, input) => this.safeHttp(input.url, input.maxBytes, ctx.signal),
    });
    this.registry.register({
      name: 'create_support_ticket',
      description: 'Create a support ticket after approval',
      inputSchema: z.object({
        title: z.string().min(3).max(200),
        description: z.string().min(1).max(5000),
        idempotencyKey: z.string().min(8).max(100),
      }),
      outputSchema: z.object({ ticketId: z.string(), status: z.string() }),
      permissions: ['ticket:write'],
      sideEffectLevel: 'high',
      timeoutMs: 5000,
      execute: async (ctx, input) => {
        const [row] =
          await db()`insert into support_tickets(tenant_id,title,description,idempotency_key,created_by) values(${ctx.tenantId},${input.title},${input.description},${input.idempotencyKey},${ctx.userId}) on conflict(tenant_id,idempotency_key) do update set title=support_tickets.title returning id,status`;
        if (!row) throw new Error('TICKET_CREATE_FAILED');
        return { ticketId: String(row.id), status: String(row.status) };
      },
    });
  }
  async sync(tenantId: string) {
    for (const tool of this.registry.list())
      await db()`insert into tool_definitions(tenant_id,name,description,input_schema_json,output_schema_json,permissions,side_effect_level,timeout_ms,handler_type) values(${tenantId},${tool.name},${tool.description},${db().json(toJsonValue(z.toJSONSchema(tool.inputSchema)))},${db().json(toJsonValue(z.toJSONSchema(tool.outputSchema)))},${db().json(tool.permissions)},${tool.sideEffectLevel},${tool.timeoutMs},'builtin') on conflict(tenant_id,name) do update set description=excluded.description,input_schema_json=excluded.input_schema_json,output_schema_json=excluded.output_schema_json,permissions=excluded.permissions,side_effect_level=excluded.side_effect_level,timeout_ms=excluded.timeout_ms`;
  }
  async execute(p: Principal, name: string, input: unknown, traceId: string) {
    try {
      return {
        ok: true as const,
        output: await this.registry.execute(
          name,
          { tenantId: p.tenantId, userId: p.userId, traceId },
          input,
        ),
      };
    } catch (error) {
      return structuredToolError(error);
    }
  }
  private async safeHttp(raw: string, maxBytes: number, signal: AbortSignal) {
    const url = new URL(raw);
    const allowed = (process.env.HTTP_TOOL_ALLOWED_DOMAINS ?? '')
      .split(',')
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean);
    if (url.protocol !== 'https:' || !allowed.includes(url.hostname.toLowerCase()))
      throw new BadRequestException('HTTP_DOMAIN_NOT_ALLOWED');
    if (isIP(url.hostname) && isPrivateAddress(url.hostname))
      throw new BadRequestException('PRIVATE_ADDRESS_BLOCKED');
    const addresses = await lookup(url.hostname, { all: true });
    if (addresses.some((x) => isPrivateAddress(x.address)))
      throw new BadRequestException('PRIVATE_ADDRESS_BLOCKED');
    const response = await fetch(url, { redirect: 'manual', signal });
    if (response.status >= 300 && response.status < 400)
      throw new BadRequestException('HTTP_REDIRECT_BLOCKED');
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) throw new BadRequestException('HTTP_RESPONSE_TOO_LARGE');
    return { status: response.status, body: new TextDecoder().decode(bytes) };
  }
}
