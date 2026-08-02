import { Injectable, NotFoundException } from '@nestjs/common';
import { db } from '@hub/db';
import {
  MockProvider,
  createProviderAdapter,
  type GenerateInput,
  type ModelProviderAdapter,
} from '@hub/ai-core';
import { encryptSecret } from '../common/security.js';
import type { Principal } from '../common/auth.js';
import { modelLatency } from '../common/observability.js';
type ConfigRow = {
  id: string;
  provider_id: string;
  model_name: string;
  input_price: string;
  output_price: string;
  provider_type: string;
  base_url: string | null;
  encrypted_api_key: string | null;
};
@Injectable()
export class ModelService {
  async createProvider(
    p: Principal,
    input: {
      providerType: 'openai' | 'openai-compatible' | 'mock';
      name: string;
      baseUrl?: string;
      apiKey?: string;
    },
  ) {
    const encrypted = input.apiKey
      ? encryptSecret(input.apiKey, String(process.env.MODEL_ENCRYPTION_KEY))
      : null;
    const [row] =
      await db()`insert into model_providers(tenant_id,provider_type,name,base_url,encrypted_api_key) values(${p.tenantId},${input.providerType},${input.name},${input.baseUrl ?? null},${encrypted}) returning id,name,provider_type,base_url,enabled`;
    return row;
  }
  providers(p: Principal) {
    return db()`select id,name,provider_type,base_url,enabled,created_at from model_providers where tenant_id=${p.tenantId} order by created_at desc`;
  }
  async addConfig(
    p: Principal,
    input: {
      providerId: string;
      modelName: string;
      inputPrice: number;
      outputPrice: number;
      capabilities: string[];
      embeddingDimensions?: number;
    },
  ) {
    const [row] =
      await db()`insert into model_configs(tenant_id,provider_id,model_name,input_price,output_price,capability_json) select ${p.tenantId},id,${input.modelName},${input.inputPrice},${input.outputPrice},${db().json({ capabilities: input.capabilities, embeddingDimensions: input.embeddingDimensions ?? 1536 })} from model_providers where tenant_id=${p.tenantId} and id=${input.providerId} returning *`;
    if (!row) throw new NotFoundException({ code: 'PROVIDER_NOT_FOUND' });
    return row;
  }
  models(p: Principal) {
    return db()`select mc.id,mc.model_name,mc.capability_json,mc.input_price,mc.output_price,mp.name provider_name from model_configs mc join model_providers mp on mp.id=mc.provider_id and mp.tenant_id=mc.tenant_id where mc.tenant_id=${p.tenantId} and mc.enabled and mp.enabled`;
  }
  async adapterFor(
    tenantId: string,
    configId: string,
  ): Promise<{ adapter: ModelProviderAdapter; config: ConfigRow }> {
    const [row] =
      await db()`select mc.id,mc.provider_id,mc.model_name,mc.input_price,mc.output_price,mp.provider_type,mp.base_url,mp.encrypted_api_key from model_configs mc join model_providers mp on mp.id=mc.provider_id and mp.tenant_id=mc.tenant_id where mc.tenant_id=${tenantId} and mc.id=${configId} and mc.enabled and mp.enabled`;
    if (!row) throw new NotFoundException({ code: 'MODEL_NOT_FOUND' });
    const config = row as unknown as ConfigRow;
    return { adapter: this.makeAdapter(config), config };
  }
  async defaultFor(tenantId: string, capability: 'chat' | 'embedding' = 'chat') {
    const [row] =
      await db()`select mc.id from model_configs mc join model_providers mp on mp.id=mc.provider_id and mp.tenant_id=mc.tenant_id where mc.tenant_id=${tenantId} and mc.enabled and mp.enabled and coalesce(mc.capability_json->'capabilities','[]'::jsonb) ? ${capability} order by case when mp.provider_type='mock' then 1 else 0 end,mc.id limit 1`;
    if (!row) throw new NotFoundException({ code: 'MODEL_NOT_CONFIGURED', capability });
    return this.adapterFor(tenantId, String(row.id));
  }
  async test(p: Principal, providerId: string) {
    const [row] =
      await db()`select id,provider_type,base_url,encrypted_api_key from model_providers where tenant_id=${p.tenantId} and id=${providerId}`;
    if (!row) throw new NotFoundException({ code: 'PROVIDER_NOT_FOUND' });
    return { healthy: await this.makeAdapter(row as unknown as ConfigRow).healthCheck() };
  }
  async generate(
    p: Principal,
    configId: string,
    input: GenerateInput,
    traceId: string,
    assistantId?: string,
  ) {
    const { adapter, config } = await this.adapterFor(p.tenantId, configId);
    const started = Date.now();
    const stopMetric = modelLatency.startTimer({ model: input.model });
    const result = await adapter
      .generate({ ...input, model: config.model_name })
      .finally(stopMetric);
    await this.usage(
      p,
      config,
      result.usage.inputTokens,
      result.usage.outputTokens,
      0,
      Date.now() - started,
      traceId,
      assistantId,
    );
    return result;
  }
  async embed(p: Principal, configId: string, texts: string[], traceId: string) {
    const { adapter, config } = await this.adapterFor(p.tenantId, configId);
    const started = Date.now();
    const vectors = await adapter.embed(config.model_name, texts);
    const embeddingTokens = Math.ceil(texts.join('').length / 4);
    await this.usage(p, config, 0, 0, embeddingTokens, Date.now() - started, traceId);
    return vectors;
  }
  async usage(
    p: Principal,
    c: ConfigRow,
    input: number,
    output: number,
    embedding: number,
    latency: number,
    traceId: string,
    assistantId?: string,
  ) {
    const cost = (input / 1e6) * Number(c.input_price) + (output / 1e6) * Number(c.output_price);
    await db()`insert into usage_records(tenant_id,user_id,assistant_id,provider_id,model_name,input_tokens,output_tokens,embedding_tokens,estimated_cost,latency_ms,trace_id) values(${p.tenantId},${p.userId},${assistantId ?? null},${c.provider_id},${c.model_name},${input},${output},${embedding},${cost},${latency},${traceId})`;
    await db()`insert into quota_buckets(tenant_id,bucket_type,period_start,used) values(${p.tenantId},'tokens',date_trunc('month',now())::date,${input + output + embedding}) on conflict(tenant_id,bucket_type,period_start) do update set used=quota_buckets.used+excluded.used,updated_at=now()`;
  }
  private makeAdapter(row: ConfigRow): ModelProviderAdapter {
    if (row.provider_type === 'mock') return new MockProvider();
    return createProviderAdapter({
      providerType: row.provider_type,
      baseUrl: row.base_url,
      encryptedApiKey: row.encrypted_api_key,
    });
  }
}
