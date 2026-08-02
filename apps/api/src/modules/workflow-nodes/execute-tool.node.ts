export const executeToolNode = async (
  state: {
    selectedTools: string[];
    input: string;
    workflowRunId: string;
    traceId: string;
  },
  run: (
    input: { prompt: string; toolName: string; toolInput: unknown },
    traceId: string,
  ) => Promise<unknown>,
) => {
  const tool = state.selectedTools[0] ?? 'current_user';
  const toolInput =
    tool === 'create_support_ticket'
      ? {
          title: state.input.slice(0, 100),
          description: state.input,
          idempotencyKey: `wf-${state.workflowRunId}`,
        }
      : {};
  return {
    toolResults: [
      (await run({ prompt: state.input, toolName: tool, toolInput }, state.traceId)) as Record<
        string,
        unknown
      >,
    ],
  };
};
