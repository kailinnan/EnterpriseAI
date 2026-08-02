import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import { createHash, randomUUID } from 'node:crypto';
import { db } from '@hub/db';
import type { Principal } from '../common/auth.js';
import { QuotaService } from './quota.service.js';
import { S3StorageAdapter } from './storage.adapter.js';
const allowed = new Map([
  ['.txt', ['text/plain']],
  ['.md', ['text/markdown', 'text/plain']],
  ['.pdf', ['application/pdf']],
  ['.docx', ['application/vnd.openxmlformats-officedocument.wordprocessingml.document']],
  ['.html', ['text/html']],
]);
@Injectable()
export class KnowledgeService implements OnModuleDestroy {
  constructor(
    private readonly quota: QuotaService,
    private readonly storage: S3StorageAdapter,
  ) {}
  private readonly queue = new Queue('documents', {
    connection: { url: String(process.env.REDIS_URL) },
  });
  async onModuleDestroy() {
    await this.queue.close();
  }
  async create(
    p: Principal,
    input: {
      name: string;
      description: string;
      embeddingModelConfigId?: string;
      chunkConfig?: { chunkTokens: number; overlapTokens: number; minChunkTokens: number };
    },
  ) {
    await this.quota.assertResource(p.tenantId, 'knowledgeBaseCount');
    if (input.embeddingModelConfigId) {
      const [model] =
        await db()`select id from model_configs where tenant_id=${p.tenantId} and id=${input.embeddingModelConfigId} and enabled and coalesce(capability_json->'capabilities','[]'::jsonb) ? 'embedding'`;
      if (!model) throw new NotFoundException({ code: 'EMBEDDING_MODEL_NOT_FOUND' });
    }
    const cfg = input.chunkConfig ?? { chunkTokens: 800, overlapTokens: 120, minChunkTokens: 80 };
    const [row] =
      await db()`insert into knowledge_bases(tenant_id,name,description,embedding_model_config_id,chunk_config_json) values(${p.tenantId},${input.name},${input.description},${input.embeddingModelConfigId ?? null},${db().json(cfg)}) returning *`;
    return row;
  }
  list(p: Principal) {
    return db()`select id,name,description,status,chunk_config_json,created_at from knowledge_bases where tenant_id=${p.tenantId} order by created_at desc`;
  }
  async one(p: Principal, id: string) {
    const [row] =
      await db()`select * from knowledge_bases where tenant_id=${p.tenantId} and id=${id}`;
    if (!row) throw new NotFoundException({ code: 'KNOWLEDGE_BASE_NOT_FOUND' });
    return row;
  }
  async update(
    p: Principal,
    id: string,
    input: {
      name?: string;
      description?: string;
      embeddingModelConfigId?: string | null;
      chunkConfig?: { chunkTokens: number; overlapTokens: number; minChunkTokens: number };
    },
  ) {
    if (input.embeddingModelConfigId) {
      const [model] =
        await db()`select id from model_configs where tenant_id=${p.tenantId} and id=${input.embeddingModelConfigId} and enabled and coalesce(capability_json->'capabilities','[]'::jsonb) ? 'embedding'`;
      if (!model) throw new NotFoundException({ code: 'MODEL_NOT_FOUND' });
    }
    const [row] =
      await db()`update knowledge_bases set name=coalesce(${input.name ?? null},name),description=coalesce(${input.description ?? null},description),embedding_model_config_id=case when ${input.embeddingModelConfigId === null} then null else coalesce(${input.embeddingModelConfigId ?? null},embedding_model_config_id) end,chunk_config_json=coalesce(${input.chunkConfig ? db().json(input.chunkConfig) : null},chunk_config_json),updated_at=now() where tenant_id=${p.tenantId} and id=${id} returning *`;
    if (!row) throw new NotFoundException({ code: 'KNOWLEDGE_BASE_NOT_FOUND' });
    return row;
  }
  async upload(p: Principal, kbId: string, file: Express.Multer.File) {
    await this.quota.assertResource(p.tenantId, 'storageBytes', file.size);
    const ext = file.originalname.toLowerCase().match(/\.[^.]+$/)?.[0];
    const mimes = ext ? allowed.get(ext) : undefined;
    if (!mimes || !mimes.includes(file.mimetype))
      throw new BadRequestException({ code: 'UNSUPPORTED_FILE_TYPE' });
    if (file.size > Number(process.env.MAX_UPLOAD_BYTES ?? 20971520))
      throw new BadRequestException({ code: 'FILE_TOO_LARGE' });
    await this.one(p, kbId);
    const sha = createHash('sha256').update(file.buffer).digest('hex');
    const duplicate =
      await db()`select id from documents where tenant_id=${p.tenantId} and knowledge_base_id=${kbId} and sha256=${sha}`;
    if (duplicate.length)
      throw new ConflictException({ code: 'DUPLICATE_DOCUMENT', documentId: duplicate[0]?.id });
    const documentId = randomUUID();
    const key = `${p.tenantId}/${kbId}/${documentId}/${encodeURIComponent(file.originalname)}`;
    await this.storage.put(key, file.buffer, file.mimetype);
    await db()`insert into documents(id,tenant_id,knowledge_base_id,file_name,object_key,mime_type,file_size,sha256,created_by) values(${documentId},${p.tenantId},${kbId},${file.originalname},${key},${file.mimetype},${file.size},${sha},${p.userId})`;
    const job = await this.queue.add(
      'document.parse',
      { tenantId: p.tenantId, knowledgeBaseId: kbId, documentId },
      {
        jobId: `${p.tenantId}:${documentId}:1`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 100,
      },
    );
    return { documentId, jobId: job.id, status: 'queued' };
  }
  documents(p: Principal, kbId: string) {
    return db()`select id,file_name,mime_type,file_size,parse_status,index_status,error_message,processing_metrics_json,created_at from documents where tenant_id=${p.tenantId} and knowledge_base_id=${kbId} order by created_at desc`;
  }
  async document(p: Principal, id: string) {
    const [row] =
      await db()`select id,knowledge_base_id,file_name,mime_type,file_size,sha256,parse_status,index_status,version,error_message,processing_metrics_json,created_at,updated_at from documents where tenant_id=${p.tenantId} and id=${id}`;
    if (!row) throw new NotFoundException({ code: 'DOCUMENT_NOT_FOUND' });
    return row;
  }
  async reindex(p: Principal, id: string) {
    const rows =
      await db()`update documents set parse_status='queued',index_status='pending',error_message=null where tenant_id=${p.tenantId} and id=${id} returning knowledge_base_id,version`;
    const row = rows[0];
    if (!row) throw new NotFoundException({ code: 'DOCUMENT_NOT_FOUND' });
    const job = await this.queue.add(
      'document.parse',
      { tenantId: p.tenantId, knowledgeBaseId: String(row.knowledge_base_id), documentId: id },
      {
        jobId: `${p.tenantId}:${id}:${Number(row.version) + 1}:${Date.now()}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    );
    return { jobId: job.id };
  }
  chunks(p: Principal, id: string) {
    return db()`select c.id,c.chunk_index,c.content,c.token_count,c.page_number,c.heading,c.paragraph_number,c.metadata_json from document_chunks c join documents d on d.id=c.document_id and d.tenant_id=c.tenant_id where c.tenant_id=${p.tenantId} and c.document_id=${id} and c.index_version=d.version order by c.chunk_index`;
  }
  async remove(p: Principal, id: string) {
    const [row] =
      await db()`select object_key from documents where tenant_id=${p.tenantId} and id=${id}`;
    if (!row) throw new NotFoundException({ code: 'DOCUMENT_NOT_FOUND' });
    await this.storage.delete(String(row.object_key));
    await db()`delete from documents where tenant_id=${p.tenantId} and id=${id}`;
    return { ok: true };
  }
  async removeKnowledgeBase(p: Principal, id: string) {
    const documents =
      await db()`select object_key from documents where tenant_id=${p.tenantId} and knowledge_base_id=${id}`;
    const [kb] =
      await db()`select id from knowledge_bases where tenant_id=${p.tenantId} and id=${id}`;
    if (!kb) throw new NotFoundException({ code: 'KNOWLEDGE_BASE_NOT_FOUND' });
    for (const document of documents) await this.storage.delete(String(document.object_key));
    await db()`delete from knowledge_bases where tenant_id=${p.tenantId} and id=${id}`;
    return { ok: true };
  }
}
