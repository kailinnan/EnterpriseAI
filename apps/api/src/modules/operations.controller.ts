import { Controller, Get, Header } from '@nestjs/common';
import { metrics } from '../common/observability.js';
import { RequireRoles } from '../common/auth.js';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
@ApiTags('operations')
@Controller()
export class OperationsController {
  @ApiOperation({ summary: '导出 Prometheus 指标' })
  @RequireRoles('owner', 'admin')
  @Get('metrics')
  @Header('Content-Type', metrics.contentType)
  metrics() {
    return metrics.metrics();
  }
}
