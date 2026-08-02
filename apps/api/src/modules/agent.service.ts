import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { db, toJsonValue } from '@hub/db';
import type { Principal } from '../common/auth.js';
import { ToolService } from './tool.service.js';
import { QuotaService } from './quota.service.js';
type AgentInput = {
  prompt: string;
  toolName?: string;
  toolInput?: unknown;
  assistantId?: string;
  conversationId?: string;
};
@Injectable()
export class AgentService {
  constructor(
    private readonly tools: ToolService,
    private readonly quota: QuotaService,
  ) {}
  async run(p: Principal, input: AgentInput, traceId: string) {
    const maxTokens = Number(process.env.AGENT_MAX_TOKENS ?? 12000);
    const maxRuntimeMs = Number(process.env.AGENT_MAX_RUNTIME_MS ?? 60000);
    const maxSteps = Number(process.env.AGENT_MAX_STEPS ?? 8);
    if (Math.ceil(input.prompt.length / 4) > maxTokens)
      throw new BadRequestException({ code: 'AGENT_TOKEN_LIMIT_EXCEEDED' });
    if (maxSteps < 1) throw new BadRequestException({ code: 'AGENT_STEP_LIMIT_EXCEEDED' });
    await this.quota.assertConcurrent(p.tenantId);
    await this.tools.sync(p.tenantId);
    const [run] =
      await db()`insert into agent_runs(tenant_id,assistant_id,conversation_id,user_id,status,input_json,trace_id) values(${p.tenantId},${input.assistantId ?? null},${input.conversationId ?? null},${p.userId},'running',${db().json(toJsonValue(input))},${traceId}) returning id`;
    if (!run) throw new Error('AGENT_CREATE_FAILED');
    const started = Date.now();
    try {
      const selected = input.toolName ?? this.select(input.prompt);
      if (!selected) {
        await db()`update agent_runs set status='completed',output_json=${db().json({ text: 'No tool required' })},state_json=${db().json({ limits: { maxTokens, maxRuntimeMs, maxSteps } })},completed_at=now() where tenant_id=${p.tenantId} and id=${run.id}`;
        return { runId: run.id, status: 'completed', output: { text: 'No tool required' } };
      }
      const definition = this.tools.registry.get(selected);
      const parsed = definition.inputSchema.parse(
        input.toolInput ?? this.inferToolInput(selected, input.prompt),
      );
      const [stored] =
        await db()`select id from tool_definitions where tenant_id=${p.tenantId} and name=${selected}`;
      if (!stored) throw new NotFoundException('TOOL_NOT_FOUND');
      const needsApproval = definition.sideEffectLevel !== 'none';
      const idempotency =
        typeof parsed === 'object' && parsed !== null && 'idempotencyKey' in parsed
          ? String((parsed as Record<string, unknown>).idempotencyKey)
          : null;
      const [call] =
        await db()`insert into tool_calls(tenant_id,agent_run_id,tool_definition_id,input_json,validated_input_json,status,approval_status,idempotency_key) values(${p.tenantId},${run.id},${stored.id},${db().json(toJsonValue(input.toolInput ?? this.inferToolInput(selected, input.prompt)))},${db().json(toJsonValue(parsed))},${needsApproval ? 'waiting_approval' : 'running'},${needsApproval ? 'pending' : 'not_required'},${idempotency}) returning id`;
      if (!call) throw new Error('TOOL_CALL_CREATE_FAILED');
      if (needsApproval) {
        await db()`update agent_runs set status='waiting_approval',state_json=${db().json({ pendingToolCallId: call.id })},step_count=1 where tenant_id=${p.tenantId} and id=${run.id}`;
        return { runId: run.id, status: 'waiting_approval', toolCallId: call.id };
      }
      const result = await this.tools.execute(p, selected, parsed, traceId);
      if (Date.now() - started > maxRuntimeMs)
        throw new BadRequestException({ code: 'AGENT_RUNTIME_LIMIT_EXCEEDED' });
      await db().begin(async (tx) => {
        await tx`update tool_calls set status=${result.ok ? 'succeeded' : 'failed'},output_json=${tx.json(toJsonValue(result))},latency_ms=${Date.now() - started} where tenant_id=${p.tenantId} and id=${call.id}`;
        await tx`update agent_runs set status=${result.ok ? 'completed' : 'failed'},output_json=${tx.json(toJsonValue(result))},step_count=1,completed_at=now() where tenant_id=${p.tenantId} and id=${run.id}`;
      });
      return { runId: run.id, status: result.ok ? 'completed' : 'failed', output: result };
    } catch (error) {
      await db()`update agent_runs set status='failed',error_json=${db().json({ code: 'AGENT_FAILED', message: error instanceof Error ? error.message : 'Unknown' })},completed_at=now() where tenant_id=${p.tenantId} and id=${run.id}`;
      throw error;
    }
  }
  async get(
    p: Principal,
    id: string,
  ): Promise<Record<string, unknown> & { toolCalls: Record<string, unknown>[] }> {
    const [run] = await db()`select * from agent_runs where tenant_id=${p.tenantId} and id=${id}`;
    if (!run) throw new NotFoundException('AGENT_RUN_NOT_FOUND');
    const calls =
      await db()`select tc.*,td.name tool_name,td.side_effect_level from tool_calls tc join tool_definitions td on td.id=tc.tool_definition_id and td.tenant_id=tc.tenant_id where tc.tenant_id=${p.tenantId} and tc.agent_run_id=${id}`;
    return { ...(run as Record<string, unknown>), toolCalls: calls as Record<string, unknown>[] };
  }
  private select(prompt: string) {
    const text = prompt.toLowerCase();
    if (/time|时间/.test(text)) return 'current_time';
    if (/who am i|当前用户|我的信息/.test(text)) return 'current_user';
    if (/用量|token|成本|cost|usage|文档状态|索引状态/.test(text)) return 'readonly_query_template';
    return undefined;
  }
  private inferToolInput(tool: string, prompt: string): unknown {
    if (tool === 'readonly_query_template') {
      return {
        queryId: /文档状态|索引状态/.test(prompt) ? 'document_status' : 'usage_summary',
        params: {},
      };
    }
    return {};
  }
}
