import { Body, Controller, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentPrincipal,
  RequireRoles,
  type AuthRequest,
  type Principal,
} from '../common/auth.js';
import { EvaluationService } from './evaluation.service.js';
@RequireRoles('owner', 'admin', 'editor')
@ApiTags('evaluations')
@Controller('evaluations')
export class EvaluationController {
  constructor(private readonly service: EvaluationService) {}
  @ApiOperation({ summary: '创建离线评估数据集' })
  @Post('datasets')
  create(@Body() body: unknown, @CurrentPrincipal() p: Principal) {
    const x = z
      .object({
        name: z.string().min(1),
        cases: z
          .array(
            z.object({
              question: z.string().min(1),
              expectedAnswer: z.string(),
              expectedDocumentIds: z.array(z.uuid()),
            }),
          )
          .min(1),
      })
      .parse(body);
    return this.service.create(p, x.name, x.cases);
  }
  @ApiOperation({ summary: '运行检索与引用质量评估' })
  @Post('run')
  run(@Body() body: unknown, @CurrentPrincipal() p: Principal, @Req() req: AuthRequest) {
    const x = z
      .object({ datasetId: z.uuid(), knowledgeBaseIds: z.array(z.uuid()).min(1) })
      .parse(body);
    return this.service.run(p, x.datasetId, x.knowledgeBaseIds, req.traceId);
  }
}
