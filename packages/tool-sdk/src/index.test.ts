import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ToolRegistry, structuredToolError } from './index.js';
describe('ToolRegistry', () => {
  it('validates input and output', async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'double',
      description: 'double',
      inputSchema: z.object({ n: z.number() }),
      outputSchema: z.object({ value: z.number() }),
      permissions: [],
      sideEffectLevel: 'none',
      timeoutMs: 100,
      execute: async (_ctx, input) => ({ value: input.n * 2 }),
    });
    await expect(
      registry.execute('double', { tenantId: 't', userId: 'u', traceId: 'x' }, { n: 2 }),
    ).resolves.toEqual({ value: 4 });
    await expect(
      registry.execute('double', { tenantId: 't', userId: 'u', traceId: 'x' }, { n: '2' }),
    ).rejects.toBeTruthy();
  });
  it('hides stack details', () =>
    expect(structuredToolError(new Error('failed'))).toEqual({
      ok: false,
      error: { code: 'TOOL_EXECUTION_FAILED', message: 'failed' },
    }));
  it('actively terminates a tool that exceeds its timeout', async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'slow',
      description: 'slow mock',
      inputSchema: z.object({}),
      outputSchema: z.object({ ok: z.boolean() }),
      permissions: [],
      sideEffectLevel: 'none',
      timeoutMs: 5,
      execute: async () => new Promise(() => undefined),
    });
    const result = await registry
      .execute('slow', { tenantId: 't', userId: 'u', traceId: 'x' }, {})
      .catch(structuredToolError);
    expect(result).toMatchObject({ error: { code: 'TOOL_TIMEOUT' } });
  });
  it('rejects oversized validated output', async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'large',
      description: 'large mock',
      inputSchema: z.object({}),
      outputSchema: z.object({ text: z.string() }),
      permissions: [],
      sideEffectLevel: 'none',
      timeoutMs: 100,
      execute: async () => ({ text: 'x'.repeat(70_000) }),
    });
    const result = await registry
      .execute('large', { tenantId: 't', userId: 'u', traceId: 'x' }, {})
      .catch(structuredToolError);
    expect(result).toMatchObject({ error: { code: 'TOOL_OUTPUT_TOO_LARGE' } });
  });
});
