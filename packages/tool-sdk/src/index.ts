import { z } from 'zod';
export type SideEffectLevel = 'none' | 'low' | 'high';
export type ToolContext = {
  tenantId: string;
  userId: string;
  traceId: string;
  signal: AbortSignal;
};
export type ToolDefinition<I, O> = {
  name: string;
  description: string;
  inputSchema: z.ZodType<I>;
  outputSchema: z.ZodType<O>;
  permissions: string[];
  sideEffectLevel: SideEffectLevel;
  timeoutMs: number;
  execute(context: ToolContext, input: I): Promise<O>;
};
export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition<unknown, unknown>>();
  register<I, O>(tool: ToolDefinition<I, O>): void {
    if (this.tools.has(tool.name)) throw new Error('TOOL_ALREADY_REGISTERED');
    this.tools.set(tool.name, tool as ToolDefinition<unknown, unknown>);
  }
  get(name: string) {
    const tool = this.tools.get(name);
    if (!tool) throw new Error('TOOL_NOT_FOUND');
    return tool;
  }
  list() {
    return [...this.tools.values()].map(({ execute: _, ...definition }) => definition);
  }
  async execute(name: string, context: Omit<ToolContext, 'signal'>, input: unknown) {
    const tool = this.get(name);
    const parsed = tool.inputSchema.parse(input);
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const output = await Promise.race([
        tool.execute({ ...context, signal: controller.signal }, parsed),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            const error = new Error('Tool execution timed out');
            error.name = 'AbortError';
            reject(error);
          }, tool.timeoutMs);
        }),
      ]);
      const validated = tool.outputSchema.parse(output);
      if (JSON.stringify(validated).length > 65_536) throw new Error('TOOL_OUTPUT_TOO_LARGE');
      return validated;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
export const structuredToolError = (error: unknown) => ({
  ok: false,
  error: {
    code:
      error instanceof z.ZodError
        ? 'TOOL_INPUT_INVALID'
        : error instanceof Error && error.name === 'AbortError'
          ? 'TOOL_TIMEOUT'
          : error instanceof Error && error.message === 'TOOL_OUTPUT_TOO_LARGE'
            ? 'TOOL_OUTPUT_TOO_LARGE'
            : 'TOOL_EXECUTION_FAILED',
    message: error instanceof Error ? error.message : 'Unknown tool error',
  },
});
