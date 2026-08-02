import { Injectable } from '@nestjs/common';
import { db } from '@hub/db';
import { reciprocalRankFusion } from '@hub/ai-core';
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
  async search(p: Principal, input: RetrievalInput) {
    const stopMetric = retrievalLatency.startTimer();
    try {
      if (input.knowledgeBaseIds.length === 0) return [];
      const [kb] =
        await db()`select embedding_model_config_id from knowledge_bases where tenant_id=${p.tenantId} and id=any(${input.knowledgeBaseIds}::uuid[]) and embedding_model_config_id is not null limit 1`;
      let embedding: number[];
      if (kb) {
        const { adapter } = await this.models.adapterFor(
          p.tenantId,
          String(kb.embedding_model_config_id),
        );
        embedding = (await adapter.embed('embedding', [input.query]))[0] ?? [];
      } else {
        const { MockProvider } = await import('@hub/ai-core');
        embedding = (await new MockProvider().embed('mock', [input.query]))[0] ?? [];
      }
      const vector = `[${embedding.join(',')}]`;
      const docIds = input.filters?.documentIds ?? [];
      const created = input.filters?.createdAfter ?? null;
      const vectors =
        (await db()`select c.id,c.document_id,c.content,c.page_number,c.heading,d.file_name,1-(c.embedding<=>${vector}::vector) score from document_chunks c join documents d on d.id=c.document_id and d.tenant_id=c.tenant_id and d.version=c.index_version where c.tenant_id=${p.tenantId} and c.knowledge_base_id=any(${input.knowledgeBaseIds}::uuid[]) and (${docIds}::uuid[]='{}' or c.document_id=any(${docIds}::uuid[])) and (${created}::timestamptz is null or d.created_at>=${created}::timestamptz) and (${input.filters?.tags ?? []}::text[]='{}' or c.metadata_json->'tags' ?| ${input.filters?.tags ?? []}) order by c.embedding<=>${vector}::vector limit 30`) as unknown as Row[];
      const keywords =
        (await db()`select c.id,c.document_id,c.content,c.page_number,c.heading,d.file_name,ts_rank_cd(c.search_vector,websearch_to_tsquery('simple',${input.query})) score from document_chunks c join documents d on d.id=c.document_id and d.tenant_id=c.tenant_id and d.version=c.index_version where c.tenant_id=${p.tenantId} and c.knowledge_base_id=any(${input.knowledgeBaseIds}::uuid[]) and c.search_vector@@websearch_to_tsquery('simple',${input.query}) and (${docIds}::uuid[]='{}' or c.document_id=any(${docIds}::uuid[])) and (${created}::timestamptz is null or d.created_at>=${created}::timestamptz) order by score desc limit 30`) as unknown as Row[];
      const fusion = reciprocalRankFusion(
        vectors.map((x) => x.id),
        keywords.map((x) => x.id),
      );
      const all = new Map([...vectors, ...keywords].map((x) => [x.id, x]));
      return [...fusion]
        .sort((a, b) => b[1] - a[1])
        .slice(0, input.topK ?? 8)
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
    } finally {
      stopMetric();
    }
  }
}
