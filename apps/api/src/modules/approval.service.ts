import { Injectable, NotFoundException } from '@nestjs/common';
import { db, toJsonValue } from '@hub/db';
import type { AuthRequest, Principal } from '../common/auth.js';
import { ToolService } from './tool.service.js';
import { AgentService } from './agent.service.js';
@Injectable()
export class ApprovalService {
  constructor(
    private readonly tools: ToolService,
    private readonly agents: AgentService,
  ) {}
  list(p: Principal) {
    return db()`select tc.id,tc.agent_run_id,tc.validated_input_json,tc.status,tc.approval_status,tc.approval_reason,tc.created_at,td.name tool_name,td.description,td.side_effect_level,ar.user_id requester_id from tool_calls tc join tool_definitions td on td.id=tc.tool_definition_id and td.tenant_id=tc.tenant_id join agent_runs ar on ar.id=tc.agent_run_id and ar.tenant_id=tc.tenant_id where tc.tenant_id=${p.tenantId} and tc.approval_status='pending' order by tc.created_at`;
  }
  async decide(
    p: Principal,
    id: string,
    decision: 'approved' | 'rejected' | 'cancelled',
    reason: string,
    req: AuthRequest,
  ) {
    const rows =
      await db()`update tool_calls set approval_status=${decision},approval_reason=${reason},approved_by=${p.userId},approved_at=now(),status=${decision === 'approved' ? 'running' : decision} where tenant_id=${p.tenantId} and id=${id} and approval_status='pending' and (${decision}<>'cancelled' or agent_run_id in(select id from agent_runs where tenant_id=${p.tenantId} and user_id=${p.userId})) returning agent_run_id,tool_definition_id,validated_input_json`;
    const call = rows[0];
    if (!call) {
      const [existing] =
        await db()`select approval_status,output_json from tool_calls where tenant_id=${p.tenantId} and id=${id}`;
      if (!existing) throw new NotFoundException('TOOL_CALL_NOT_FOUND');
      const stored = existing.output_json as { output?: unknown } | null;
      return {
        status: existing.approval_status,
        output: stored?.output ?? stored,
        idempotent: true,
      };
    }
    await this.audit(p, id, decision, req);
    if (decision !== 'approved') {
      await db()`update agent_runs set status=${decision},completed_at=now() where tenant_id=${p.tenantId} and id=${call.agent_run_id}`;
      return { status: decision };
    }
    const [definition] =
      await db()`select name from tool_definitions where tenant_id=${p.tenantId} and id=${call.tool_definition_id}`;
    if (!definition) throw new NotFoundException('TOOL_NOT_FOUND');
    const started = Date.now();
    const requester = await this.agents.getRequester(p.tenantId, String(call.agent_run_id));
    const result = await this.tools.execute(
      requester,
      String(definition.name),
      call.validated_input_json,
      req.traceId,
    );
    await db().begin(async (tx) => {
      await tx`update tool_calls set status=${result.ok ? 'succeeded' : 'failed'},output_json=${tx.json(toJsonValue(result))},latency_ms=${Date.now() - started} where tenant_id=${p.tenantId} and id=${id}`;
    });
    await this.audit(p, id, 'executed', req);
    const resumed = await this.agents.resume(
      requester,
      String(call.agent_run_id),
      id,
      String(definition.name),
      result,
      req.traceId,
    );
    return { status: resumed.status, output: result.ok ? result.output : result, agent: resumed };
  }
  private async audit(p: Principal, id: string, decision: string, req: AuthRequest) {
    await db()`insert into audit_logs(tenant_id,actor_user_id,action,resource_type,resource_id,request_id,ip,user_agent,after_json) values(${p.tenantId},${p.userId},${`tool.${decision}`},'tool_call',${id},${req.requestId},${req.ip ?? null},${req.headers['user-agent'] ?? null},${db().json({ decision })})`;
  }
}
