export const generateAnswerNode = (state: {
  draftAnswer: string;
  retrievedChunks: Record<string, unknown>[];
  toolResults: Record<string, unknown>[];
}) => ({
  draftAnswer:
    state.draftAnswer ||
    (state.retrievedChunks.length
      ? `根据知识库召回了 ${state.retrievedChunks.length} 条资料。`
      : state.toolResults.length
        ? '业务工具处理已完成或正在等待审批。'
        : '这是普通对话回复。'),
});
