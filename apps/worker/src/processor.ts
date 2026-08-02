import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';
import { chunkText, createProviderAdapter } from '@hub/ai-core';
import { db } from '@hub/db';
import { parseDocument } from './parser.js';
type JobData = { tenantId: string; knowledgeBaseId: string; documentId: string };
const s3 = new S3Client({
  endpoint: String(process.env.S3_ENDPOINT),
  region: process.env.S3_REGION ?? 'us-east-1',
  forcePathStyle: true,
  credentials: {
    accessKeyId: String(process.env.S3_ACCESS_KEY),
    secretAccessKey: String(process.env.S3_SECRET_KEY),
  },
});
export const processDocument = async (data: JobData): Promise<void> => {
  const started = Date.now();
  const [doc] =
    await db()`select d.*,kb.chunk_config_json,kb.embedding_model_config_id from documents d join knowledge_bases kb on kb.id=d.knowledge_base_id and kb.tenant_id=d.tenant_id where d.tenant_id=${data.tenantId} and d.knowledge_base_id=${data.knowledgeBaseId} and d.id=${data.documentId}`;
  if (!doc) throw new Error('DOCUMENT_NOT_FOUND');
  await db()`update documents set parse_status='running',index_status='running',error_message=null where tenant_id=${data.tenantId} and id=${data.documentId}`;
  try {
    const object = await s3.send(
      new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: String(doc.object_key) }),
    );
    const buffer = Buffer.from(await object.Body!.transformToByteArray());
    const parseStarted = Date.now();
    const paragraphs = await parseDocument(buffer, String(doc.mime_type));
    const parseMs = Date.now() - parseStarted;
    const cfg = doc.chunk_config_json as {
      chunkTokens: number;
      overlapTokens: number;
      minChunkTokens: number;
    };
    const chunkStarted = Date.now();
    const chunks = chunkText(paragraphs, cfg);
    const unique = [
      ...new Map(
        chunks.map((x) => [createHash('sha256').update(x.content).digest('hex'), x]),
      ).entries(),
    ];
    const chunkMs = Date.now() - chunkStarted;
    const embedStarted = Date.now();
    const [model] = doc.embedding_model_config_id
      ? await db()`select mc.model_name,mc.provider_id,mc.input_price,mp.provider_type,mp.base_url,mp.encrypted_api_key from model_configs mc join model_providers mp on mp.id=mc.provider_id and mp.tenant_id=mc.tenant_id where mc.tenant_id=${data.tenantId} and mc.id=${doc.embedding_model_config_id} and mc.enabled and mp.enabled`
      : await db()`select mc.model_name,mc.provider_id,mc.input_price,mp.provider_type,mp.base_url,mp.encrypted_api_key from model_configs mc join model_providers mp on mp.id=mc.provider_id and mp.tenant_id=mc.tenant_id where mc.tenant_id=${data.tenantId} and mc.enabled and mp.enabled and coalesce(mc.capability_json->'capabilities','[]'::jsonb) ? 'embedding' order by case when mp.provider_type='mock' then 0 else 1 end,mc.id limit 1`;
    if (!model) throw new Error('EMBEDDING_MODEL_NOT_CONFIGURED');
    const provider = createProviderAdapter({
      providerType: String(model.provider_type),
      baseUrl: model.base_url ? String(model.base_url) : null,
      encryptedApiKey: model.encrypted_api_key ? String(model.encrypted_api_key) : null,
    });
    const vectors: number[][] = [];
    for (let i = 0; i < unique.length; i += 32)
      vectors.push(
        ...(await provider.embed(
          String(model.model_name),
          unique.slice(i, i + 32).map(([, x]) => x.content),
        )),
      );
    if (vectors.some((vector) => vector.length !== 1536))
      throw new Error('EMBEDDING_DIMENSION_MISMATCH_EXPECTED_1536');
    const embedMs = Date.now() - embedStarted;
    const embeddingTokens = Math.ceil(unique.reduce((sum, [, x]) => sum + x.content.length, 0) / 4);
    const newVersion = Number(doc.version) + 1;
    await db().begin(async (tx) => {
      for (let i = 0; i < unique.length; i++) {
        const entry = unique[i];
        const vector = vectors[i];
        if (!entry || !vector) throw new Error('EMBEDDING_COUNT_MISMATCH');
        const [hash, chunk] = entry;
        await tx`insert into document_chunks(tenant_id,knowledge_base_id,document_id,index_version,chunk_index,content,content_hash,token_count,page_number,heading,paragraph_number,metadata_json,embedding) values(${data.tenantId},${data.knowledgeBaseId},${data.documentId},${newVersion},${i},${chunk.content},${hash},${chunk.tokenCount},${chunk.pageNumber},${chunk.heading},${chunk.paragraphNumber},${tx.json({ source: String(doc.file_name) })},${`[${vector.join(',')}]`}::vector) on conflict(document_id,index_version,content_hash) do nothing`;
      }
      await tx`update documents set version=${newVersion},parse_status='succeeded',index_status='ready',error_message=null,processing_metrics_json=${tx.json({ parseMs, chunkMs, embedMs, totalMs: Date.now() - started, chunkCount: unique.length })},updated_at=now() where tenant_id=${data.tenantId} and id=${data.documentId}`;
      await tx`insert into usage_records(tenant_id,user_id,provider_id,model_name,embedding_tokens,estimated_cost,latency_ms,trace_id) values(${data.tenantId},${doc.created_by},${model.provider_id},${model.model_name},${embeddingTokens},${(embeddingTokens / 1_000_000) * Number(model.input_price)},${embedMs},${`document:${data.documentId}:v${newVersion}`})`;
      await tx`insert into quota_buckets(tenant_id,bucket_type,period_start,used) values(${data.tenantId},'tokens',date_trunc('month',now())::date,${embeddingTokens}) on conflict(tenant_id,bucket_type,period_start) do update set used=quota_buckets.used+excluded.used,updated_at=now()`;
      await tx`delete from document_chunks where tenant_id=${data.tenantId} and document_id=${data.documentId} and index_version<${newVersion}`;
    });
  } catch (error) {
    await db()`update documents set parse_status='failed',index_status='failed',error_message=${error instanceof Error ? error.message : 'UNKNOWN'},processing_metrics_json=${db().json({ totalMs: Date.now() - started })},updated_at=now() where tenant_id=${data.tenantId} and id=${data.documentId}`;
    throw error;
  }
};
