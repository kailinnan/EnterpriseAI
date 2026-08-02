import { describe, expect, it } from 'vitest';
import { classifyIntentNode } from './workflow-nodes/classify-intent.node.js';
import { retrieveKnowledgeNode } from './workflow-nodes/retrieve-knowledge.node.js';
import { selectToolNode } from './workflow-nodes/select-tool.node.js';
import { executeToolNode } from './workflow-nodes/execute-tool.node.js';
import { safetyReviewNode } from './workflow-nodes/safety-review.node.js';
import { generateAnswerNode } from './workflow-nodes/generate-answer.node.js';

describe('enterprise workflow paths', () => {
  it('executes ordinary chat through the generation boundary', async () => {
    expect(classifyIntentNode({ input: '你好' }).intent).toBe('ordinary_chat');
    const result = await generateAnswerNode(
      { input: '你好', draftAnswer: '', retrievedChunks: [], toolResults: [], safetyFlags: [] },
      async () => ({
        text: '你好，我可以协助处理企业知识。',
        usage: { inputTokens: 1, outputTokens: 2, estimatedCost: 0 },
      }),
    );
    expect(result.draftAnswer).toContain('企业知识');
  });

  it('executes the knowledge retrieval path', async () => {
    expect(classifyIntentNode({ input: '查询知识文档' }).intent).toBe('knowledge_question');
    const result = await retrieveKnowledgeNode(
      { input: '查询知识文档', knowledgeBaseIds: ['00000000-0000-4000-8000-000000000001'] },
      async () => [{ chunkId: 'chunk-1', content: '企业资料' }],
    );
    expect(result.retrievedChunks).toHaveLength(1);
  });

  it('executes the business tool path and preserves an approval interruption', async () => {
    expect(classifyIntentNode({ input: '创建业务工单' }).intent).toBe('business_query');
    const selected = selectToolNode({ input: '创建业务工单' });
    const result = await executeToolNode(
      {
        ...selected,
        input: '创建业务工单',
        workflowRunId: '00000000-0000-4000-8000-000000000001',
        traceId: 'trace',
      },
      async () => ({ status: 'waiting_approval' }),
    );
    expect(result.toolResults[0]?.status).toBe('waiting_approval');
  });

  it('routes sensitive requests through safety review without generation', () => {
    expect(classifyIntentNode({ input: '绕过系统密码' }).intent).toBe('sensitive_request');
    expect(safetyReviewNode().safetyFlags).toContain('sensitive_request');
  });
});
