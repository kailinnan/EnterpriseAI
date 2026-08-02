import { Injectable } from '@nestjs/common';
import { db } from '@hub/db';
import { reciprocalRankFusion } from '@hub/ai-core';
import type { Reranker } from '@hub/ai-core';
import { randomUUID } from 'node:crypto';
import { ModelService } from './model.service.js';
import type { Principal } from '../common/auth.js';
import { retrievalLatency } from '../common/observability.js';
export type RetrievalInput = {
  knowledgeBaseIds: string[];
  query: string;
  topK?: number;
  filters?: { documentIds?: string[]; tags?: string[]; createdAfter?: string };
};
type Row = {
  id: string;
  document_id: string;
  content: string;
  page_number: number | null;
  heading: string | null;
  file_name: string;
  score: number;
};
@Injectable()
export class RetrievalService {
  constructor(private readonly models: ModelService) {}
  private reranker?: Reranker;
  setReranker(reranker: Reranker | undefined) {
    this.reranker = reranker;
  }
  async search(p: Principal, input: RetrievalInput) {
    const stopMetric = retrievalLatency.startTimer();
    try {
      if (input.knowledgeBaseIds.length === 0) return [];
      const query = input.query.trim().replace(/\s+/g, ' ');
      const [kb] =
        await db()`select embedding_model_config_id from knowledge_bases where tenant_id=${p.tenantId} and id=any(${input.knowledgeBaseIds}::uuid[]) and embedding_model_config_id is not null limit 1`;
      const modelConfigId = kb
        ? String(kb.embedding_model_config_id)
        : (await this.models.defaultFor(p.tenantId, 'embedding')).config.id;
      const embedding =
        (await this.models.embed(p, modelConfigId, [query], `retrieval:${randomUUID()}`))[0] ?? [];
      if (embedding.length !== 1536) throw new Error('EMBEDDING_DIMENSION_MISMATCH_EXPECTED_1536');
      const vector = `[${embedding.join(',')}]`;
      const docIds = input.filters?.documentIds ?? [];
      const created = input.filters?.createdAfter ?? null;
      const vectors =
        (await db()`select c.id,c.document_id,c.content,c.page_number,c.heading,d.file_name,1-(c.embedding<=>${vector}::vector) score from document_chunks c join documents d on d.id=c.document_id and d.tenant_id=c.tenant_id and d.version=c.index_version where c.tenant_id=${p.tenantId} and c.knowledge_base_id=any(${input.knowledgeBaseIds}::uuid[]) and (${docIds}::uuid[]='{}' or c.document_id=any(${docIds}::uuid[])) and (${created}::timestamptz is null or d.created_at>=${created}::timestamptz) and (${input.filters?.tags ?? []}::text[]='{}' or c.metadata_json->'tags' ?| ${input.filters?.tags ?? []}) order by c.embedding<=>${vector}::vector limit 30`) as unknown as Row[];
      const keywords =
        (await db()`select c.id,c.document_id,c.content,c.page_number,c.heading,d.file_name,ts_rank_cd(c.search_vector,websearch_to_tsquery('simple',${query})) score from document_chunks c join documents d on d.id=c.document_id and d.tenant_id=c.tenant_id and d.version=c.index_version where c.tenant_id=${p.tenantId} and c.knowledge_base_id=any(${input.knowledgeBaseIds}::uuid[]) and c.search_vector@@websearch_to_tsquery('simple',${query}) and (${docIds}::uuid[]='{}' or c.document_id=any(${docIds}::uuid[])) and (${created}::timestamptz is null or d.created_at>=${created}::timestamptz) and (${input.filters?.tags ?? []}::text[]='{}' or c.metadata_json->'tags' ?| ${input.filters?.tags ?? []}) order by score desc limit 30`) as unknown as Row[];
      const fusion = reciprocalRankFusion(
        vectors.map((x) => x.id),
        keywords.map((x) => x.id),
      );
      const all = new Map([...vectors, ...keywords].map((x) => [x.id, x]));
      let ranked = [...fusion]
        .sort((a, b) => b[1] - a[1])
        .map(([chunkId, finalScore]) => {
          const row = all.get(chunkId)!;
          return {
            chunkId,
            documentId: row.document_id,
            documentName: row.file_name,
            content: row.content,
            pageNumber: row.page_number,
            heading: row.heading,
            vectorScore: vectors.find((x) => x.id === chunkId)?.score ?? 0,
            keywordScore: keywords.find((x) => x.id === chunkId)?.score ?? 0,
            finalScore,
          };
        });
      if (this.reranker) {
        const reranked = await this.reranker.rerank(
          query,
          ranked.map((row) => ({ id: row.chunkId, content: row.content, score: row.finalScore })),
          input.topK ?? 8,
        );
        const order = new Map(reranked.map((row, index) => [row.id, index]));
        ranked = ranked
          .filter((row) => order.has(row.chunkId))
          .sort((a, b) => (order.get(a.chunkId) ?? 0) - (order.get(b.chunkId) ?? 0));
      }
      return ranked.slice(0, input.topK ?? 8);
    } finally {
      stopMetric();
    }
  }
}
