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
        await tx`insert into assistants(tenant_id,name,description,system_prompt,model_config_id,temperature,max_output_tokens,retrieval_config_json) select ${p.tenantId},${input.name},${input.description},${input.systemPrompt},mc.id,${input.temperature},${input.maxOutputTokens},${tx.json(input.retrievalConfig)} from model_configs mc where mc.tenant_id=${p.tenantId} and mc.id=${input.modelConfigId} returning *`;
      if (!a) throw new NotFoundException({ code: 'MODEL_NOT_FOUND' });
      for (const kbId of input.knowledgeBaseIds)
        await tx`insert into assistant_knowledge_bases(tenant_id,assistant_id,knowledge_base_id) select ${p.tenantId},${a.id},id from knowledge_bases where tenant_id=${p.tenantId} and id=${kbId}`;
      return a;
    });
  }
  list(p: Principal) {
    return db()`select id,name,description,status,published_version,created_at from assistants where tenant_id=${p.tenantId} order by created_at desc`;
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
  get modelService() {
    return this.models;
  }
}
