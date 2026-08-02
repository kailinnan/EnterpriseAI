export const generateAnswerNode = async (
  state: {
    input: string;
    draftAnswer: string;
    retrievedChunks: Record<string, unknown>[];
    toolResults: Record<string, unknown>[];
    safetyFlags: string[];
  },
  generate: (state: {
    input: string;
    retrievedChunks: Record<string, unknown>[];
    toolResults: Record<string, unknown>[];
  }) => Promise<{
    text: string;
    usage: { inputTokens: number; outputTokens: number; estimatedCost: number };
  }>,
) => {
  if (state.safetyFlags.length && state.draftAnswer)
    return {
      draftAnswer: state.draftAnswer,
      usage: { inputTokens: 0, outputTokens: 0, estimatedCost: 0 },
    };
  const result = await generate(state);
  return { draftAnswer: result.text, usage: result.usage };
};
