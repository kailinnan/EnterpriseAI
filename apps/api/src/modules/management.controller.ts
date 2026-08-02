import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { db } from '@hub/db';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal, RequireRoles, RequireScopes, type Principal } from '../common/auth.js';
@ApiTags('management')
@Controller()
export class ManagementController {
  @ApiOperation({ summary: '查询租户审计日志' })
  @RequireRoles('owner', 'admin')
  @Get('audit-logs')
  audit(@CurrentPrincipal() p: Principal, @Query('limit') raw?: string) {
    const limit = z.coerce.number().int().min(1).max(500).default(100).parse(raw);
    return db()`select id,actor_user_id,action,resource_type,resource_id,request_id,ip,before_json,after_json,created_at from audit_logs where tenant_id=${p.tenantId} order by created_at desc limit ${limit}`;
  }
  @ApiOperation({ summary: '查询近 30 天用量趋势' })
  @RequireScopes('usage:read')
  @Get('usage/timeseries')
  timeseries(@CurrentPrincipal() p: Principal) {
    return db()`select date_trunc('day',created_at) bucket,sum(input_tokens)::text input_tokens,sum(output_tokens)::text output_tokens,sum(embedding_tokens)::text embedding_tokens,sum(estimated_cost)::text cost from usage_records where tenant_id=${p.tenantId} and created_at>=now()-interval '30 days' group by bucket order by bucket`;
  }
}
