import { describe, expect, it } from 'vitest';
import { calculateEvaluationMetrics } from './evaluation.metrics.js';

describe('evaluation regression metrics', () => {
  it('calculates deterministic retrieval and citation metrics', () => {
    expect(
      calculateEvaluationMetrics([
        {
          expectedDocumentIds: ['a'],
          retrievedDocumentIds: ['a', 'b'],
          expectedAnswer: '企业知识',
          generatedAnswer: '企业知识',
          retrievedContents: ['企业知识资料'],
          latencyMs: 10,
          estimatedCost: 0.1,
        },
        {
          expectedDocumentIds: ['c'],
          retrievedDocumentIds: ['x'],
          expectedAnswer: '订单完成',
          generatedAnswer: '未知',
          retrievedContents: ['无相关内容'],
          latencyMs: 30,
          estimatedCost: 0.2,
        },
      ]),
    ).toEqual({
      caseCount: 2,
      retrievalHitRate: 0.5,
      citationPrecision: 0.25,
      answerGroundedness: 0.5,
      answerSimilarity: 0.5,
      averageLatencyMs: 20,
      estimatedCost: 0.30000000000000004,
    });
  });
});
