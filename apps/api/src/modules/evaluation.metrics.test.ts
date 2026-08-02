import { describe, expect, it } from 'vitest';
import { calculateEvaluationMetrics } from './evaluation.metrics.js';

describe('evaluation regression metrics', () => {
  it('calculates deterministic retrieval and citation metrics', () => {
    expect(
      calculateEvaluationMetrics([
        { expectedDocumentIds: ['a'], retrievedDocumentIds: ['a', 'b'], latencyMs: 10 },
        { expectedDocumentIds: ['c'], retrievedDocumentIds: ['x'], latencyMs: 30 },
      ]),
    ).toEqual({
      caseCount: 2,
      retrievalHitRate: 0.5,
      citationPrecision: 0.25,
      answerGroundedness: 0.5,
      averageLatencyMs: 20,
      estimatedCost: 0,
    });
  });
});
