import { Body, Controller, Get, Param, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  CurrentPrincipal,
  RequireRoles,
  RequireScopes,
  type AuthRequest,
  type Principal,
} from '../common/auth.js';
import { AgentService } from './agent.service.js';
import { ApprovalService } from './approval.service.js';
const id = (x: string) => z.uuid().parse(x);
const event = (res: Response, name: string, data: unknown) =>
  res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
@ApiTags('agent-runs')
@Controller()
export class AgentController {
  constructor(
    private readonly agents: AgentService,
    private readonly approvals: ApprovalService,
  ) {}
  @ApiOperation({ summary: '运行一次受限 Agent' })
  @RequireScopes('agent:run')
  @Post('agent-runs')
  run(@Body() body: unknown, @CurrentPrincipal() p: Principal, @Req() req: AuthRequest) {
    const input = z
      .object({
        prompt: z.string().min(1).max(10000),
        toolName: z
          .enum([
            'current_user',
            'current_time',
            'knowledge_search',
            'http_request_whitelist',
            'readonly_query_template',
            'create_support_ticket',
          ])
          .optional(),
        toolInput: z.unknown().optional(),
        assistantId: z.uuid().optional(),
        conversationId: z.uuid().optional(),
      })
      .parse(body);
    return this.agents.run(p, input, req.traceId);
  }
  @ApiOperation({ summary: '通过 SSE 运行 Agent' })
  @RequireScopes('agent:run')
  @Post('agent-runs/stream')
  async runStream(
    @Body() body: unknown,
    @CurrentPrincipal() p: Principal,
    @Req() req: AuthRequest,
    @Res() res: Response,
  ) {
    const input = z
      .object({
        prompt: z.string().min(1).max(10000),
        toolName: z
          .enum([
            'current_user',
            'current_time',
            'knowledge_search',
            'http_request_whitelist',
            'readonly_query_template',
            'create_support_ticket',
          ])
          .optional(),
        toolInput: z.unknown().optional(),
        assistantId: z.uuid().optional(),
        conversationId: z.uuid().optional(),
      })
      .parse(body);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    event(res, 'agent.started', { traceId: req.traceId });
    try {
      const result = await this.agents.run(p, input, req.traceId);
      event(
        res,
        result.status === 'waiting_approval' ? 'agent.interrupted' : 'agent.completed',
        result,
      );
    } catch (error) {
      event(res, 'agent.failed', {
        code: 'AGENT_FAILED',
        message: error instanceof Error ? error.message : 'Unknown',
      });
    }
    res.end();
  }
  @ApiOperation({ summary: '查询 Agent 运行及工具调用' })
  @Get('agent-runs/:id')
  get(@Param('id') raw: string, @CurrentPrincipal() p: Principal) {
    return this.agents.get(p, id(raw));
  }
  @ApiOperation({ summary: '通过 SSE 获取 Agent 运行快照' })
  @Get('agent-runs/:id/stream')
  async stream(@Param('id') raw: string, @CurrentPrincipal() p: Principal, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    const run = await this.agents.get(p, id(raw));
    event(res, 'agent.snapshot', run);
    for (const call of run.toolCalls as Record<string, unknown>[]) event(res, 'tool.call', call);
    event(res, `agent.${String(run.status)}`, { runId: run.id });
    res.end();
  }
  @ApiOperation({ summary: '列出待审批的高风险工具调用' })
  @RequireRoles('owner', 'admin')
  @Get('tool-calls/pending')
  pending(@CurrentPrincipal() p: Principal) {
    return this.approvals.list(p);
  }
  @ApiOperation({ summary: '批准并执行工具调用' })
  @RequireRoles('owner', 'admin')
  @Post('tool-calls/:id/approve')
  approve(
    @Param('id') raw: string,
    @Body() body: unknown,
    @CurrentPrincipal() p: Principal,
    @Req() req: AuthRequest,
  ) {
    const { reason } = z.object({ reason: z.string().max(1000).default('') }).parse(body);
    return this.approvals.decide(p, id(raw), 'approved', reason, req);
  }
  @ApiOperation({ summary: '拒绝工具调用' })
  @RequireRoles('owner', 'admin')
  @Post('tool-calls/:id/reject')
  reject(
    @Param('id') raw: string,
    @Body() body: unknown,
    @CurrentPrincipal() p: Principal,
    @Req() req: AuthRequest,
  ) {
    const { reason } = z.object({ reason: z.string().min(1).max(1000) }).parse(body);
    return this.approvals.decide(p, id(raw), 'rejected', reason, req);
  }
  @ApiOperation({ summary: '取消工具调用' })
  @Post('tool-calls/:id/cancel')
  cancel(
    @Param('id') raw: string,
    @Body() body: unknown,
    @CurrentPrincipal() p: Principal,
    @Req() req: AuthRequest,
  ) {
    const { reason } = z.object({ reason: z.string().max(1000).default('') }).parse(body);
    return this.approvals.decide(p, id(raw), 'cancelled', reason, req);
  }
}
