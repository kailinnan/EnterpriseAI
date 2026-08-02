import { Body, Controller, Get, Param, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentPrincipal, type AuthRequest, type Principal } from '../common/auth.js';
import { WorkflowService } from './workflow.service.js';
@ApiTags('workflow-runs')
@Controller('workflow-runs')
export class WorkflowController {
  constructor(private readonly service: WorkflowService) {}
  @ApiOperation({ summary: '运行 LangGraph 工作流' })
  @Post()
  run(@Body() body: unknown, @CurrentPrincipal() p: Principal, @Req() req: AuthRequest) {
    const x = z
      .object({
        text: z.string().min(1).max(10000),
        assistantId: z.uuid().optional(),
        conversationId: z.uuid().optional(),
        knowledgeBaseIds: z.array(z.uuid()).default([]),
      })
      .parse(body);
    return this.service.run(p, x, req.traceId);
  }
  @ApiOperation({ summary: '查询工作流状态和节点轨迹' })
  @Get(':id')
  get(@Param('id') id: string, @CurrentPrincipal() p: Principal) {
    return this.service.get(p, z.uuid().parse(id));
  }
  @ApiOperation({ summary: '审批后恢复工作流' })
  @Post(':id/resume')
  resume(@Param('id') id: string, @CurrentPrincipal() p: Principal) {
    return this.service.resume(p, z.uuid().parse(id));
  }
  @ApiOperation({ summary: '通过 SSE 获取工作流节点轨迹' })
  @Get(':id/stream')
  async stream(@Param('id') id: string, @CurrentPrincipal() p: Principal, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    const run = await this.service.get(p, z.uuid().parse(id));
    res.write(`event: workflow.snapshot\ndata: ${JSON.stringify(run)}\n\n`);
    for (const node of run.nodes)
      res.write(`event: workflow.node\ndata: ${JSON.stringify(node)}\n\n`);
    res.write(`event: workflow.${String(run.status)}\ndata: ${JSON.stringify({ runId: id })}\n\n`);
    res.end();
  }
}
