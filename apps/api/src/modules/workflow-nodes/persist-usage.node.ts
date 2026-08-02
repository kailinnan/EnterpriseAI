export const persistUsageNode = (state: {
  usage: { inputTokens: number; outputTokens: number; estimatedCost: number };
}) => ({ usage: state.usage });
