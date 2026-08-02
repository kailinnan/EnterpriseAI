import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';
import { chunkText, MockProvider } from '@hub/ai-core';
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
    const provider = new MockProvider();
    const vectors: number[][] = [];
    for (let i = 0; i < unique.length; i += 32)
      vectors.push(
        ...(await provider.embed(
          'embedding',
          unique.slice(i, i + 32).map(([, x]) => x.content),
        )),
      );
    const embedMs = Date.now() - embedStarted;
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
      await tx`delete from document_chunks where tenant_id=${data.tenantId} and document_id=${data.documentId} and index_version<${newVersion}`;
    });
  } catch (error) {
    await db()`update documents set parse_status='failed',index_status='failed',error_message=${error instanceof Error ? error.message : 'UNKNOWN'},processing_metrics_json=${db().json({ totalMs: Date.now() - started })},updated_at=now() where tenant_id=${data.tenantId} and id=${data.documentId}`;
    throw error;
  }
};
