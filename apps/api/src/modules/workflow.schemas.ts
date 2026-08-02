import { z } from 'zod';

export const workflowIntentSchema = z.enum([
  'ordinary_chat',
  'knowledge_question',
  'business_query',
  'sensitive_request',
]);

export const workflowStateSchema = z.object({
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  assistantId: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),
  input: z.string(),
  intent: workflowIntentSchema.optional(),
  knowledgeBaseIds: z.array(z.string().uuid()),
  retrievedChunks: z.array(z.record(z.string(), z.unknown())),
  selectedTools: z.array(z.string()),
  toolResults: z.array(z.record(z.string(), z.unknown())),
  draftAnswer: z.string(),
  citations: z.array(z.string()),
  safetyFlags: z.array(z.string()),
  usage: z.object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    estimatedCost: z.number().nonnegative(),
  }),
  errors: z.array(z.string()),
  traceId: z.string().min(1),
  workflowRunId: z.string().uuid(),
});

export const workflowNodeOutputSchemas: Record<string, z.ZodType> = {
  validate_input: z.object({}),
  classify_intent: z.object({ intent: workflowIntentSchema }),
  retrieve_knowledge: z.object({
    retrievedChunks: z.array(z.record(z.string(), z.unknown())),
  }),
  select_tool: z.object({ selectedTools: z.array(z.string()) }),
  execute_tool: z.object({ toolResults: z.array(z.record(z.string(), z.unknown())) }),
  safety_review: z.object({ safetyFlags: z.array(z.string()), draftAnswer: z.string() }),
  generate_answer: z.object({ draftAnswer: z.string() }),
  citation_validate: z.object({ citations: z.array(z.string()) }),
  persist_usage: z.object({
    usage: z.object({
      inputTokens: z.number().int().nonnegative(),
      outputTokens: z.number().int().nonnegative(),
      estimatedCost: z.number().nonnegative(),
    }),
  }),
};
