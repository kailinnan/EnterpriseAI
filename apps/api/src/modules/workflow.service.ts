import { Injectable, NotFoundException } from '@nestjs/common';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { db, toJsonValue } from '@hub/db';
import type { Principal } from '../common/auth.js';
import { RetrievalService } from './retrieval.service.js';
import { AgentService } from './agent.service.js';
import { QuotaService } from './quota.service.js';
import { workflowNodeOutputSchemas, workflowStateSchema } from './workflow.schemas.js';
import { validateInputNode } from './workflow-nodes/validate-input.node.js';
import {
  classifyIntentNode,
  type WorkflowIntent as Intent,
} from './workflow-nodes/classify-intent.node.js';
import { retrieveKnowledgeNode } from './workflow-nodes/retrieve-knowledge.node.js';
import { selectToolNode } from './workflow-nodes/select-tool.node.js';
import { executeToolNode } from './workflow-nodes/execute-tool.node.js';
import { safetyReviewNode } from './workflow-nodes/safety-review.node.js';
import { generateAnswerNode } from './workflow-nodes/generate-answer.node.js';
import { citationValidateNode } from './workflow-nodes/citation-validate.node.js';
import { persistUsageNode } from './workflow-nodes/persist-usage.node.js';
export { classifyIntent } from './workflow-nodes/classify-intent.node.js';
const State = Annotation.Root({
  tenantId: Annotation<string>(),
  userId: Annotation<string>(),
  assistantId: Annotation<string | undefined>(),
  conversationId: Annotation<string | undefined>(),
  input: Annotation<string>(),
  intent: Annotation<Intent | undefined>(),
  knowledgeBaseIds: Annotation<string[]>({ reducer: (_a, b) => b, default: () => [] }),
  retrievedChunks: Annotation<Record<string, unknown>[]>({
    reducer: (_a, b) => b,
    default: () => [],
  }),
  selectedTools: Annotation<string[]>({ reducer: (_a, b) => b, default: () => [] }),
  toolResults: Annotation<Record<string, unknown>[]>({ reducer: (_a, b) => b, default: () => [] }),
  draftAnswer: Annotation<string>({ reducer: (_a, b) => b, default: () => '' }),
  citations: Annotation<string[]>({ reducer: (_a, b) => b, default: () => [] }),
  safetyFlags: Annotation<string[]>({ reducer: (_a, b) => b, default: () => [] }),
  usage: Annotation<{ inputTokens: number; outputTokens: number; estimatedCost: number }>({
    reducer: (_a, b) => b,
    default: () => ({ inputTokens: 0, outputTokens: 0, estimatedCost: 0 }),
  }),
  errors: Annotation<string[]>({ reducer: (_a, b) => b, default: () => [] }),
  traceId: Annotation<string>(),
  workflowRunId: Annotation<string>(),
});
type WorkflowState = typeof State.State;
@Injectable()
export class WorkflowService {
  constructor(
    private readonly retrieval: RetrievalService,
    private readonly agents: AgentService,
    private readonly quota: QuotaService,
  ) {}
  async run(
    p: Principal,
    input: {
      text: string;
      assistantId?: string;
      conversationId?: string;
      knowledgeBaseIds: string[];
    },
    traceId: string,
  ) {
    await this.quota.assertConcurrent(p.tenantId);
    const [run] =
      await db()`insert into workflow_runs(tenant_id,user_id,assistant_id,conversation_id,status,input_json,state_json,trace_id) values(${p.tenantId},${p.userId},${input.assistantId ?? null},${input.conversationId ?? null},'running',${db().json(input)},'{}',${traceId}) returning id`;
    if (!run) throw new Error('WORKFLOW_CREATE_FAILED');
    try {
      const graph = this.graph(p);
      const final = await graph.invoke({
        tenantId: p.tenantId,
        userId: p.userId,
        assistantId: input.assistantId,
        conversationId: input.conversationId,
        input: input.text,
        knowledgeBaseIds: input.knowledgeBaseIds,
        traceId,
        workflowRunId: String(run.id),
      });
      const waiting = final.toolResults.some((x) => x.status === 'waiting_approval');
      await db()`update workflow_runs set status=${waiting ? 'waiting_approval' : 'completed'},state_json=${db().json(toJsonValue(this.compact(final)))},completed_at=${waiting ? null : new Date()} where tenant_id=${p.tenantId} and id=${run.id}`;
      return {
        runId: run.id,
        status: waiting ? 'waiting_approval' : 'completed',
        state: this.compact(final),
      };
    } catch (error) {
      await db()`update workflow_runs set status='failed',error_json=${db().json({ code: 'WORKFLOW_FAILED', message: error instanceof Error ? error.message : 'Unknown' })},completed_at=now() where tenant_id=${p.tenantId} and id=${run.id}`;
      throw error;
    }
  }
  async get(
    p: Principal,
    id: string,
  ): Promise<Record<string, unknown> & { nodes: Record<string, unknown>[] }> {
    const [run] =
      await db()`select * from workflow_runs where tenant_id=${p.tenantId} and id=${id}`;
    if (!run) throw new NotFoundException('WORKFLOW_NOT_FOUND');
    const nodes =
      await db()`select * from workflow_node_runs where tenant_id=${p.tenantId} and workflow_run_id=${id} order by created_at`;
    return { ...(run as Record<string, unknown>), nodes: nodes as Record<string, unknown>[] };
  }
  async resume(p: Principal, id: string) {
    const run = await this.get(p, id);
    if (run.status !== 'waiting_approval') return run;
    const pending = (
      await db()`select count(*)::int count from tool_calls tc join agent_runs ar on ar.id=tc.agent_run_id and ar.tenant_id=tc.tenant_id where tc.tenant_id=${p.tenantId} and ar.trace_id=${String(run.trace_id)} and tc.approval_status='pending'`
    )[0];
    if (Number(pending?.count) > 0) return { runId: id, status: 'waiting_approval' };
    await db()`update workflow_runs set status='completed',completed_at=now() where tenant_id=${p.tenantId} and id=${id}`;
    return this.get(p, id);
  }
  private graph(p: Principal) {
    const node =
      (
        name: string,
        fn: (s: WorkflowState) => Promise<Partial<WorkflowState>> | Partial<WorkflowState>,
      ) =>
      async (s: WorkflowState) => {
        const started = Date.now();
        try {
          let last: unknown;
          let out: Partial<WorkflowState> | undefined;
          for (let attempt = 0; attempt < 2; attempt++) {
            let timer: ReturnType<typeof setTimeout> | undefined;
            try {
              const validatedState = workflowStateSchema.parse(s) as WorkflowState;
              const candidate = await Promise.race([
                Promise.resolve(fn(validatedState)),
                new Promise<never>((_resolve, reject) => {
                  timer = setTimeout(
                    () => reject(new Error(`${name.toUpperCase()}_TIMEOUT`)),
                    15000,
                  );
                }),
              ]);
              const outputSchema = workflowNodeOutputSchemas[name];
              if (!outputSchema) throw new Error(`NODE_SCHEMA_NOT_FOUND:${name}`);
              out = outputSchema.parse(candidate) as Partial<WorkflowState>;
              break;
            } catch (error) {
              last = error;
              const retryable =
                error instanceof Error &&
                /TIMEOUT|RETRYABLE|ECONNRESET|ETIMEDOUT/.test(error.message);
              if (attempt === 1 || !retryable) throw error;
            } finally {
              if (timer) clearTimeout(timer);
            }
          }
          if (!out) throw last ?? new Error(`${name.toUpperCase()}_FAILED`);
          await db()`insert into workflow_node_runs(tenant_id,workflow_run_id,node_name,status,input_summary_json,output_summary_json,latency_ms) values(${s.tenantId},${s.workflowRunId},${name},'succeeded',${db().json({ intent: s.intent, inputLength: s.input.length })},${db().json(toJsonValue(out))},${Date.now() - started})`;
          return out;
        } catch (error) {
          await db()`insert into workflow_node_runs(tenant_id,workflow_run_id,node_name,status,latency_ms,error_json) values(${s.tenantId},${s.workflowRunId},${name},'failed',${Date.now() - started},${db().json({ code: `${name.toUpperCase()}_FAILED`, message: error instanceof Error ? error.message : 'Unknown' })})`;
          throw error;
        }
      };
    const graph = new StateGraph(State)
      .addNode('validate_input', node('validate_input', validateInputNode))
      .addNode('classify_intent', node('classify_intent', classifyIntentNode))
      .addNode(
        'retrieve_knowledge',
        node('retrieve_knowledge', (s) =>
          retrieveKnowledgeNode(s, (input) => this.retrieval.search(p, input)),
        ),
      )
      .addNode('select_tool', node('select_tool', selectToolNode))
      .addNode(
        'execute_tool',
        node('execute_tool', (s) =>
          executeToolNode(s, (input, traceId) => this.agents.run(p, input, traceId)),
        ),
      )
      .addNode('safety_review', node('safety_review', safetyReviewNode))
      .addNode('generate_answer', node('generate_answer', generateAnswerNode))
      .addNode('citation_validate', node('citation_validate', citationValidateNode))
      .addNode('persist_usage', node('persist_usage', persistUsageNode));
    return graph
      .addEdge(START, 'validate_input')
      .addEdge('validate_input', 'classify_intent')
      .addConditionalEdges('classify_intent', (s) => s.intent ?? 'ordinary_chat', {
        ordinary_chat: 'generate_answer',
        knowledge_question: 'retrieve_knowledge',
        business_query: 'select_tool',
        sensitive_request: 'safety_review',
      })
      .addEdge('retrieve_knowledge', 'generate_answer')
      .addEdge('select_tool', 'execute_tool')
      .addEdge('execute_tool', 'generate_answer')
      .addEdge('safety_review', 'generate_answer')
      .addEdge('generate_answer', 'citation_validate')
      .addEdge('citation_validate', 'persist_usage')
      .addEdge('persist_usage', END)
      .compile();
  }
  private compact(s: WorkflowState) {
    return {
      input: s.input,
      intent: s.intent,
      retrievedChunks: s.retrievedChunks.slice(0, 8),
      selectedTools: s.selectedTools,
      toolResults: s.toolResults,
      draftAnswer: s.draftAnswer,
      citations: s.citations,
      safetyFlags: s.safetyFlags,
      usage: s.usage,
      errors: s.errors,
    };
  }
}
