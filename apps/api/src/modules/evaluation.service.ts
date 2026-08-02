import { Injectable, NotFoundException } from '@nestjs/common';
import { db } from '@hub/db';
import type { Principal } from '../common/auth.js';
import { RetrievalService } from './retrieval.service.js';
import { calculateEvaluationMetrics, type EvaluationObservation } from './evaluation.metrics.js';
@Injectable()
export class EvaluationService {
  constructor(private readonly retrieval: RetrievalService) {}
  async create(
    p: Principal,
    name: string,
    cases: { question: string; expectedAnswer: string; expectedDocumentIds: string[] }[],
  ) {
    return db().begin(async (tx) => {
      const [d] =
        await tx`insert into evaluation_datasets(tenant_id,name) values(${p.tenantId},${name}) returning id,name`;
      if (!d) throw new Error('DATASET_CREATE_FAILED');
      for (const c of cases)
        await tx`insert into evaluation_cases(tenant_id,dataset_id,question,expected_answer,expected_document_ids) values(${p.tenantId},${d.id},${c.question},${c.expectedAnswer},${tx.json(c.expectedDocumentIds)})`;
      return d;
    });
  }
  async run(p: Principal, datasetId: string, knowledgeBaseIds: string[], traceId: string) {
    const cases =
      await db()`select * from evaluation_cases where tenant_id=${p.tenantId} and dataset_id=${datasetId}`;
    if (!cases.length) throw new NotFoundException('EVALUATION_CASES_NOT_FOUND');
    const [run] =
      await db()`insert into evaluation_runs(tenant_id,dataset_id,status,trace_id) values(${p.tenantId},${datasetId},'running',${traceId}) returning id`;
    const observations: EvaluationObservation[] = [];
    for (const c of cases) {
      const started = Date.now();
      const rows = await this.retrieval.search(p, {
        knowledgeBaseIds,
        query: String(c.question),
        topK: 8,
      });
      observations.push({
        expectedDocumentIds: c.expected_document_ids as string[],
        retrievedDocumentIds: rows.map((row) => row.documentId),
        latencyMs: Date.now() - started,
      });
    }
    const metrics = calculateEvaluationMetrics(observations);
    await db()`update evaluation_runs set status='completed',metrics_json=${db().json(metrics)},completed_at=now() where tenant_id=${p.tenantId} and id=${run?.id}`;
    return { runId: run?.id, metrics };
  }
}
