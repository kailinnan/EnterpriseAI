export type EvaluationObservation = {
  expectedDocumentIds: string[];
  retrievedDocumentIds: string[];
  expectedAnswer: string;
  generatedAnswer: string;
  retrievedContents: string[];
  latencyMs: number;
  estimatedCost: number;
};

export const calculateEvaluationMetrics = (observations: EvaluationObservation[]) => {
  if (!observations.length) throw new Error('EVALUATION_CASES_REQUIRED');
  let hits = 0;
  let citationPrecision = 0;
  let latency = 0;
  let groundedness = 0;
  let answerSimilarity = 0;
  let cost = 0;
  for (const observation of observations) {
    const expected = new Set(observation.expectedDocumentIds);
    const matching = observation.retrievedDocumentIds.filter((id) => expected.has(id));
    if (matching.length) hits++;
    citationPrecision += matching.length / Math.max(observation.retrievedDocumentIds.length, 1);
    latency += observation.latencyMs;
    const sourceTerms = terms(observation.retrievedContents.join(' '));
    const answerTerms = terms(observation.generatedAnswer);
    groundedness += overlap(answerTerms, sourceTerms);
    answerSimilarity += overlap(answerTerms, terms(observation.expectedAnswer));
    cost += observation.estimatedCost;
  }
  return {
    caseCount: observations.length,
    retrievalHitRate: hits / observations.length,
    citationPrecision: citationPrecision / observations.length,
    answerGroundedness: groundedness / observations.length,
    answerSimilarity: answerSimilarity / observations.length,
    averageLatencyMs: latency / observations.length,
    estimatedCost: cost,
  };
};

const terms = (text: string): Set<string> =>
  new Set(
    (text.toLowerCase().match(/[a-z0-9]+|[\u4e00-\u9fff]/g) ?? []).filter(
      (term) => term.length > 0,
    ),
  );

const overlap = (actual: Set<string>, expected: Set<string>): number => {
  if (!actual.size) return 0;
  return [...actual].filter((term) => expected.has(term)).length / actual.size;
};
