export const persistUsageNode = (state: { input: string; draftAnswer: string }) => ({
  usage: {
    inputTokens: Math.ceil(state.input.length / 4),
    outputTokens: Math.ceil(state.draftAnswer.length / 4),
    estimatedCost: 0,
  },
});
