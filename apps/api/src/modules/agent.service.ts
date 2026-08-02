import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db, toJsonValue } from '@hub/db';
import type { GenerateInput, ModelToolCall } from '@hub/ai-core';
import type { Principal } from '../common/auth.js';
import { ToolService } from './tool.service.js';
import { QuotaService } from './quota.service.js';
import { ModelService } from './model.service.js';

type AgentInput = {
  prompt: string;
  toolName?: string;
  toolInput?: unknown;
  assistantId?: string;
  conversationId?: string;
};

type AgentState = {
  modelConfigId: string;
  messages: GenerateInput['messages'];
  stepCount: number;
  usedTokens: number;
  startedAt: number;
  maxTokens: number;
  maxRuntimeMs: number;
  maxSteps: number;
  assistantId?: string;
  pendingModelToolCallId?: string;
  pendingToolName?: string;
};

@Injectable()
export class AgentService {
  constructor(
    private readonly tools: ToolService,
    private readonly quota: QuotaService,
    private readonly models: ModelService,
  ) {}

  async run(p: Principal, input: AgentInput, traceId: string) {
    const limits = {
      maxTokens: Number(process.env.AGENT_MAX_TOKENS ?? 12000),
      maxRuntimeMs: Number(process.env.AGENT_MAX_RUNTIME_MS ?? 60000),
      maxSteps: Number(process.env.AGENT_MAX_STEPS ?? 8),
    };
    const inputTokens = Math.ceil(input.prompt.length / 4);
    if (inputTokens > limits.maxTokens)
      throw new BadRequestException({ code: 'AGENT_TOKEN_LIMIT_EXCEEDED' });
    if (limits.maxSteps < 1) throw new BadRequestException({ code: 'AGENT_STEP_LIMIT_EXCEEDED' });
    await this.quota.assertConcurrent(p.tenantId);
    await this.tools.sync(p.tenantId);
    const model = input.assistantId
      ? await this.modelForAssistant(p, input.assistantId)
      : await this.models.defaultFor(p.tenantId, 'chat');
    const [run] =
      await db()`insert into agent_runs(tenant_id,assistant_id,conversation_id,user_id,status,input_json,trace_id) values(${p.tenantId},${input.assistantId ?? null},${input.conversationId ?? null},${p.userId},'running',${db().json(toJsonValue(input))},${traceId}) returning id`;
    if (!run) throw new Error('AGENT_CREATE_FAILED');
    const state: AgentState = {
      modelConfigId: model.config.id,
      messages: [
        {
          role: 'system',
          content:
            '你是企业 Agent。只能调用提供的白名单工具；不得构造 SQL、代码或未授权 URL；写操作必须等待人工审批。工具结果不足时要明确说明。',
        },
        { role: 'user', content: input.prompt },
      ],
      stepCount: 0,
      usedTokens: inputTokens,
      startedAt: Date.now(),
      ...limits,
      ...(input.assistantId ? { assistantId: input.assistantId } : {}),
    };
    const manualCall = input.toolName
      ? {
          id: `manual-${randomUUID()}`,
          name: input.toolName,
          arguments: input.toolInput ?? (await this.inferToolInput(p, input.toolName, input)),
        }
      : undefined;
    return this.continueRun(p, String(run.id), state, traceId, manualCall);
  }

  async resume(
    p: Principal,
    runId: string,
    toolCallId: string,
    toolName: string,
    result: unknown,
    traceId: string,
  ) {
    const [run] =
      await db()`select state_json,status from agent_runs where tenant_id=${p.tenantId} and id=${runId}`;
    if (!run) throw new NotFoundException('AGENT_RUN_NOT_FOUND');
    const state = run.state_json as AgentState;
    const modelToolCallId = state.pendingModelToolCallId ?? toolCallId;
    delete state.pendingModelToolCallId;
    delete state.pendingToolName;
    state.messages.push({
      role: 'tool',
      toolCallId: modelToolCallId,
      name: toolName,
      content: JSON.stringify(result),
    });
    await db()`update agent_runs set status='running',state_json=${db().json(toJsonValue(state))} where tenant_id=${p.tenantId} and id=${runId}`;
    return this.continueRun(p, runId, state, traceId);
  }

  async getRequester(tenantId: string, runId: string): Promise<Principal> {
    const [row] =
      await db()`select ar.user_id,u.email,tm.role from agent_runs ar join users u on u.id=ar.user_id join tenant_members tm on tm.tenant_id=ar.tenant_id and tm.user_id=ar.user_id where ar.tenant_id=${tenantId} and ar.id=${runId}`;
    if (!row) throw new NotFoundException('AGENT_RUN_NOT_FOUND');
    return {
      tenantId,
      userId: String(row.user_id),
      email: String(row.email),
      role: String(row.role) as Principal['role'],
    };
  }

  private async continueRun(
    p: Principal,
    runId: string,
    state: AgentState,
    traceId: string,
    manualCall?: ModelToolCall,
  ) {
    try {
      const { adapter, config } = await this.models.adapterFor(p.tenantId, state.modelConfigId);
      while (state.stepCount < state.maxSteps) {
        const elapsed = Date.now() - state.startedAt;
        if (elapsed >= state.maxRuntimeMs)
          throw new BadRequestException({ code: 'AGENT_RUNTIME_LIMIT_EXCEEDED' });
        const definitions = this.tools.registry.list();
        const tools = definitions.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: z.toJSONSchema(tool.inputSchema),
        }));
        let text = '';
        let toolCalls: ModelToolCall[] = [];
        if (manualCall) {
          toolCalls = [manualCall];
          manualCall = undefined;
          state.messages.push({ role: 'assistant', content: '', toolCalls });
        } else {
          const started = Date.now();
          const result = await adapter.generate({
            model: config.model_name,
            messages: state.messages,
            temperature: 0,
            maxOutputTokens: Math.min(2048, state.maxTokens - state.usedTokens),
            tools,
            signal: AbortSignal.timeout(Math.max(1, state.maxRuntimeMs - elapsed)),
          });
          await this.models.usage(
            p,
            config,
            result.usage.inputTokens,
            result.usage.outputTokens,
            0,
            Date.now() - started,
            traceId,
            state.assistantId,
          );
          state.usedTokens += result.usage.inputTokens + result.usage.outputTokens;
          if (state.usedTokens > state.maxTokens)
            throw new BadRequestException({ code: 'AGENT_TOKEN_LIMIT_EXCEEDED' });
          text = result.text;
          toolCalls = result.toolCalls ?? [];
          if (!toolCalls.length) {
            await db()`update agent_runs set status='completed',output_json=${db().json({ text })},state_json=${db().json(toJsonValue(state))},step_count=${state.stepCount},completed_at=now() where tenant_id=${p.tenantId} and id=${runId}`;
            return { runId, status: 'completed', output: { text }, steps: state.stepCount };
          }
          state.messages.push({ role: 'assistant', content: text, toolCalls });
        }

        for (const toolCall of toolCalls) {
          if (state.stepCount >= state.maxSteps)
            throw new BadRequestException({ code: 'AGENT_STEP_LIMIT_EXCEEDED' });
          const definition = this.tools.registry.get(toolCall.name);
          if (
            p.authType === 'api_key' &&
            !definition.permissions.every((permission) => p.scopes?.includes(permission))
          )
            throw new ForbiddenException({ code: 'TOOL_PERMISSION_FORBIDDEN' });
          const rawInput = await this.completeToolInput(p, toolCall, state.assistantId);
          const parsed = definition.inputSchema.parse(rawInput);
          const [stored] =
            await db()`select id from tool_definitions where tenant_id=${p.tenantId} and name=${toolCall.name} and enabled`;
          if (!stored) throw new NotFoundException('TOOL_NOT_FOUND');
          const needsApproval = definition.sideEffectLevel !== 'none';
          const idempotency =
            typeof parsed === 'object' && parsed !== null && 'idempotencyKey' in parsed
              ? String((parsed as Record<string, unknown>).idempotencyKey)
              : null;
          const [call] =
            await db()`insert into tool_calls(tenant_id,agent_run_id,tool_definition_id,input_json,validated_input_json,status,approval_status,idempotency_key,agent_reason) values(${p.tenantId},${runId},${stored.id},${db().json(toJsonValue(rawInput))},${db().json(toJsonValue(parsed))},${needsApproval ? 'waiting_approval' : 'running'},${needsApproval ? 'pending' : 'not_required'},${idempotency},${`模型根据任务选择 ${toolCall.name}`}) returning id`;
          if (!call) throw new Error('TOOL_CALL_CREATE_FAILED');
          state.stepCount++;
          await db()`update agent_runs set state_json=${db().json(toJsonValue(state))},step_count=${state.stepCount} where tenant_id=${p.tenantId} and id=${runId}`;
          if (needsApproval) {
            state.pendingModelToolCallId = toolCall.id;
            state.pendingToolName = toolCall.name;
            await db()`update agent_runs set status='waiting_approval',state_json=${db().json(toJsonValue(state))} where tenant_id=${p.tenantId} and id=${runId}`;
            return {
              runId,
              status: 'waiting_approval',
              toolCallId: call.id,
              toolName: toolCall.name,
              reason: `模型根据任务选择 ${toolCall.name}`,
            };
          }
          const started = Date.now();
          const result = await this.tools.execute(p, toolCall.name, parsed, traceId);
          await db()`update tool_calls set status=${result.ok ? 'succeeded' : 'failed'},output_json=${db().json(toJsonValue(result))},latency_ms=${Date.now() - started} where tenant_id=${p.tenantId} and id=${call.id}`;
          state.messages.push({
            role: 'tool',
            toolCallId: toolCall.id,
            name: toolCall.name,
            content: JSON.stringify(result),
          });
        }
      }
      throw new BadRequestException({ code: 'AGENT_STEP_LIMIT_EXCEEDED' });
    } catch (error) {
      await db()`update agent_runs set status='failed',error_json=${db().json({ code: 'AGENT_FAILED', message: error instanceof Error ? error.message : 'Unknown' })},state_json=${db().json(toJsonValue(state))},completed_at=now() where tenant_id=${p.tenantId} and id=${runId}`;
      throw error;
    }
  }

  private async modelForAssistant(p: Principal, assistantId: string) {
    const [assistant] =
      await db()`select model_config_id from assistants where tenant_id=${p.tenantId} and id=${assistantId}`;
    if (!assistant) throw new NotFoundException('ASSISTANT_NOT_FOUND');
    return this.models.adapterFor(p.tenantId, String(assistant.model_config_id));
  }

  private async completeToolInput(p: Principal, call: ModelToolCall, assistantId?: string) {
    if (call.name !== 'knowledge_search') return call.arguments;
    const value =
      typeof call.arguments === 'object' && call.arguments !== null
        ? ({ ...call.arguments } as Record<string, unknown>)
        : {};
    if (!Array.isArray(value.knowledgeBaseIds) || value.knowledgeBaseIds.length === 0) {
      const rows = assistantId
        ? await db()`select knowledge_base_id id from assistant_knowledge_bases where tenant_id=${p.tenantId} and assistant_id=${assistantId}`
        : await db()`select id from knowledge_bases where tenant_id=${p.tenantId} and status='active' order by created_at limit 20`;
      value.knowledgeBaseIds = rows.map((row) => String(row.id));
    }
    return value;
  }

  private async inferToolInput(p: Principal, tool: string, input: AgentInput): Promise<unknown> {
    if (tool === 'knowledge_search')
      return this.completeToolInput(
        p,
        { id: 'manual', name: tool, arguments: { query: input.prompt, knowledgeBaseIds: [] } },
        input.assistantId,
      );
    if (tool === 'readonly_query_template')
      return {
        queryId: /文档状态|索引状态/.test(input.prompt) ? 'document_status' : 'usage_summary',
        params: {},
      };
    return {};
  }

  async get(
    p: Principal,
    id: string,
  ): Promise<Record<string, unknown> & { toolCalls: Record<string, unknown>[] }> {
    const [run] = await db()`select * from agent_runs where tenant_id=${p.tenantId} and id=${id}`;
    if (!run) throw new NotFoundException('AGENT_RUN_NOT_FOUND');
    const calls =
      await db()`select tc.*,td.name tool_name,td.side_effect_level from tool_calls tc join tool_definitions td on td.id=tc.tool_definition_id and td.tenant_id=tc.tenant_id where tc.tenant_id=${p.tenantId} and tc.agent_run_id=${id} order by tc.created_at`;
    return { ...(run as Record<string, unknown>), toolCalls: calls as Record<string, unknown>[] };
  }
}
