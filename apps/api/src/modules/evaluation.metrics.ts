export type EvaluationObservation = {
  expectedDocumentIds: string[];
  retrievedDocumentIds: string[];
  latencyMs: number;
};

export const calculateEvaluationMetrics = (observations: EvaluationObservation[]) => {
  if (!observations.length) throw new Error('EVALUATION_CASES_REQUIRED');
  let hits = 0;
  let citationPrecision = 0;
  let latency = 0;
  for (const observation of observations) {
    const expected = new Set(observation.expectedDocumentIds);
    const matching = observation.retrievedDocumentIds.filter((id) => expected.has(id));
    if (matching.length) hits++;
    citationPrecision += matching.length / Math.max(observation.retrievedDocumentIds.length, 1);
    latency += observation.latencyMs;
  }
  return {
    caseCount: observations.length,
    retrievalHitRate: hits / observations.length,
    citationPrecision: citationPrecision / observations.length,
    answerGroundedness: hits / observations.length,
    averageLatencyMs: latency / observations.length,
    estimatedCost: 0,
  };
};
