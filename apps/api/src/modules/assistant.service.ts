import { Injectable, NotFoundException } from '@nestjs/common';
import { db } from '@hub/db';
import type { Principal } from '../common/auth.js';
import { RetrievalService } from './retrieval.service.js';
import { ModelService } from './model.service.js';
import { QuotaService } from './quota.service.js';
@Injectable()
export class AssistantService {
  constructor(
    private readonly retrieval: RetrievalService,
    private readonly models: ModelService,
    private readonly quota: QuotaService,
  ) {}
  async create(
    p: Principal,
    input: {
      name: string;
      description: string;
      systemPrompt: string;
      modelConfigId: string;
      temperature: number;
      maxOutputTokens: number;
      retrievalConfig: Record<string, number>;
      knowledgeBaseIds: string[];
    },
  ) {
    await this.quota.assertResource(p.tenantId, 'assistantCount');
    return db().begin(async (tx) => {
      const [a] =
        await tx`insert into assistants(tenant_id,name,description,system_prompt,model_config_id,temperature,max_output_tokens,retrieval_config_json) select ${p.tenantId},${input.name},${input.description},${input.systemPrompt},mc.id,${input.temperature},${input.maxOutputTokens},${tx.json(input.retrievalConfig)} from model_configs mc where mc.tenant_id=${p.tenantId} and mc.id=${input.modelConfigId} and mc.enabled and coalesce(mc.capability_json->'capabilities','[]'::jsonb) ? 'chat' returning *`;
      if (!a) throw new NotFoundException({ code: 'MODEL_NOT_FOUND' });
      for (const kbId of input.knowledgeBaseIds) {
        const rows =
          await tx`insert into assistant_knowledge_bases(tenant_id,assistant_id,knowledge_base_id) select ${p.tenantId},${a.id},id from knowledge_bases where tenant_id=${p.tenantId} and id=${kbId} returning knowledge_base_id`;
        if (!rows.length) throw new NotFoundException({ code: 'KNOWLEDGE_BASE_NOT_FOUND' });
      }
      return a;
    });
  }
  list(p: Principal) {
    return db()`select id,name,description,status,published_version,created_at from assistants where tenant_id=${p.tenantId} order by created_at desc`;
  }
  async one(p: Principal, id: string) {
    const [assistant] =
      await db()`select * from assistants where tenant_id=${p.tenantId} and id=${id}`;
    if (!assistant) throw new NotFoundException({ code: 'ASSISTANT_NOT_FOUND' });
    const knowledgeBases =
      await db()`select kb.id,kb.name from assistant_knowledge_bases akb join knowledge_bases kb on kb.id=akb.knowledge_base_id and kb.tenant_id=akb.tenant_id where akb.tenant_id=${p.tenantId} and akb.assistant_id=${id}`;
    return { ...(assistant as Record<string, unknown>), knowledgeBases };
  }
  async update(
    p: Principal,
    id: string,
    input: {
      name?: string;
      description?: string;
      systemPrompt?: string;
      modelConfigId?: string;
      temperature?: number;
      maxOutputTokens?: number;
      retrievalConfig?: Record<string, number>;
      knowledgeBaseIds?: string[];
    },
  ) {
    return db().begin(async (tx) => {
      if (input.modelConfigId) {
        const [model] =
          await tx`select id from model_configs where tenant_id=${p.tenantId} and id=${input.modelConfigId} and enabled and coalesce(capability_json->'capabilities','[]'::jsonb) ? 'chat'`;
        if (!model) throw new NotFoundException({ code: 'MODEL_NOT_FOUND' });
      }
      const [assistant] =
        await tx`update assistants set name=coalesce(${input.name ?? null},name),description=coalesce(${input.description ?? null},description),system_prompt=coalesce(${input.systemPrompt ?? null},system_prompt),model_config_id=coalesce(${input.modelConfigId ?? null},model_config_id),temperature=coalesce(${input.temperature ?? null},temperature),max_output_tokens=coalesce(${input.maxOutputTokens ?? null},max_output_tokens),retrieval_config_json=coalesce(${input.retrievalConfig ? tx.json(input.retrievalConfig) : null},retrieval_config_json),updated_at=now() where tenant_id=${p.tenantId} and id=${id} returning *`;
      if (!assistant) throw new NotFoundException({ code: 'ASSISTANT_NOT_FOUND' });
      if (input.knowledgeBaseIds) {
        await tx`delete from assistant_knowledge_bases where tenant_id=${p.tenantId} and assistant_id=${id}`;
        for (const kbId of input.knowledgeBaseIds) {
          const rows =
            await tx`insert into assistant_knowledge_bases(tenant_id,assistant_id,knowledge_base_id) select ${p.tenantId},${id},id from knowledge_bases where tenant_id=${p.tenantId} and id=${kbId} returning knowledge_base_id`;
          if (!rows.length) throw new NotFoundException({ code: 'KNOWLEDGE_BASE_NOT_FOUND' });
        }
      }
      return assistant;
    });
  }
  async publish(p: Principal, id: string) {
    const [assistant] =
      await db()`update assistants set status='published',published_version=published_version+1,updated_at=now() where tenant_id=${p.tenantId} and id=${id} returning *`;
    if (!assistant) throw new NotFoundException({ code: 'ASSISTANT_NOT_FOUND' });
    return assistant;
  }
  async remove(p: Principal, id: string) {
    const rows = await db()`delete from assistants where tenant_id=${p.tenantId} and id=${id} returning id`;
    if (!rows.length) throw new NotFoundException({ code: 'ASSISTANT_NOT_FOUND' });
    return { ok: true };
  }
  async test(p: Principal, id: string, content: string, traceId: string) {
    const assistant = (await this.one(p, id)) as Record<string, unknown>;
    const result = await this.models.generate(
      p,
      String(assistant.model_config_id),
      {
        model: String(assistant.model_config_id),
        messages: [
          { role: 'system', content: String(assistant.system_prompt) },
          { role: 'user', content },
        ],
        temperature: Number(assistant.temperature),
        maxOutputTokens: Number(assistant.max_output_tokens),
      },
      traceId,
      id,
    );
    return { text: result.text, usage: result.usage, traceId };
  }
  async conversation(p: Principal, assistantId: string) {
    const [row] =
      await db()`insert into conversations(tenant_id,assistant_id,user_id,title) select ${p.tenantId},id,${p.userId},'新对话' from assistants where tenant_id=${p.tenantId} and id=${assistantId} returning *`;
    if (!row) throw new NotFoundException({ code: 'ASSISTANT_NOT_FOUND' });
    return row;
  }
  conversations(p: Principal) {
    return db()`select c.id,c.title,c.status,c.updated_at,a.name assistant_name from conversations c join assistants a on a.id=c.assistant_id and a.tenant_id=c.tenant_id where c.tenant_id=${p.tenantId} and c.user_id=${p.userId} order by c.updated_at desc`;
  }
  messages(p: Principal, id: string) {
    return db()`select m.id,m.role,m.content_json,m.token_usage_json,m.model_name,m.latency_ms,m.trace_id,m.created_at from messages m join conversations c on c.id=m.conversation_id and c.tenant_id=m.tenant_id where m.tenant_id=${p.tenantId} and m.conversation_id=${id} and c.user_id=${p.userId} order by m.created_at`;
  }
  async context(p: Principal, conversationId: string, query: string) {
    const [a] =
      await db()`select a.*,c.id conversation_id from conversations c join assistants a on a.id=c.assistant_id and a.tenant_id=c.tenant_id where c.tenant_id=${p.tenantId} and c.id=${conversationId} and c.user_id=${p.userId}`;
    if (!a) throw new NotFoundException({ code: 'CONVERSATION_NOT_FOUND' });
    const kbs =
      await db()`select knowledge_base_id from assistant_knowledge_bases where tenant_id=${p.tenantId} and assistant_id=${a.id}`;
    const chunks = await this.retrieval.search(p, {
      knowledgeBaseIds: kbs.map((x) => String(x.knowledge_base_id)),
      query,
      topK: Number((a.retrieval_config_json as { topK?: number }).topK ?? 8),
    });
    return { assistant: a, chunks };
  }
  async cancel(p: Principal, traceId: string) {
    await db()`insert into generation_cancellations(trace_id,tenant_id) values(${traceId},${p.tenantId}) on conflict do nothing`;
    return { ok: true };
  }
  async cancelled(tenantId: string, traceId: string) {
    return (
      (
        await db()`select 1 from generation_cancellations where tenant_id=${tenantId} and trace_id=${traceId}`
      ).length > 0
    );
  }
  async summarize(p: Principal, conversationId: string, traceId: string) {
    const [conversation] =
      await db()`select c.id,c.assistant_id,a.model_config_id from conversations c join assistants a on a.id=c.assistant_id and a.tenant_id=c.tenant_id where c.tenant_id=${p.tenantId} and c.id=${conversationId} and c.user_id=${p.userId}`;
    if (!conversation) throw new NotFoundException({ code: 'CONVERSATION_NOT_FOUND' });
    const rows =
      await db()`select role,content_json from messages where tenant_id=${p.tenantId} and conversation_id=${conversationId} order by created_at desc limit 40`;
    const transcript = rows
      .reverse()
      .map(
        (row) =>
          `${String(row.role)}: ${String((row.content_json as { text?: string }).text ?? '')}`,
      )
      .join('\n')
      .slice(0, 20000);
    const generated = await this.models.generate(
      p,
      String(conversation.model_config_id),
      {
        model: '',
        messages: [
          { role: 'system', content: '将以下企业对话压缩为事实准确、简洁的上下文摘要。' },
          { role: 'user', content: transcript },
        ],
        temperature: 0,
        maxOutputTokens: 800,
      },
      traceId,
      String(conversation.assistant_id),
    );
    await db()`update conversations set summary=${generated.text},updated_at=now() where tenant_id=${p.tenantId} and id=${conversationId}`;
    return { summary: generated.text, usage: generated.usage };
  }
  get modelService() {
    return this.models;
  }
}
