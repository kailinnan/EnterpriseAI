import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal, RequireRoles, RequireScopes, type Principal } from '../common/auth.js';
import { QuotaService } from './quota.service.js';
@ApiTags('quota-and-api-keys')
@Controller()
export class QuotaController {
  constructor(private readonly service: QuotaService) {}
  @ApiOperation({ summary: '创建只展示一次的 API Key' })
  @RequireRoles('owner', 'admin')
  @Post('api-keys')
  create(@Body() body: unknown, @CurrentPrincipal() p: Principal) {
    const x = z
      .object({
        name: z.string().min(1).max(100),
        scopes: z.array(z.enum(['agent:run', 'chat:write', 'knowledge:read', 'usage:read'])).min(1),
        expiresAt: z.iso.datetime().optional(),
      })
      .parse(body);
    return this.service.createKey(p, x);
  }
  @ApiOperation({ summary: '列出 API Key 元数据' })
  @RequireRoles('owner', 'admin')
  @Get('api-keys')
  keys(@CurrentPrincipal() p: Principal) {
    return this.service.keys(p);
  }
  @ApiOperation({ summary: '吊销 API Key' })
  @RequireRoles('owner', 'admin')
  @Delete('api-keys/:id')
  revoke(@Param('id') id: string, @CurrentPrincipal() p: Principal) {
    return this.service.revoke(p, z.uuid().parse(id));
  }
  @ApiOperation({ summary: '增加租户 Token 额度' })
  @RequireRoles('owner')
  @Post('usage/credit')
  credit(@Body() body: unknown, @CurrentPrincipal() p: Principal) {
    const { tokens } = z.object({ tokens: z.number().int().positive() }).parse(body);
    return this.service.credit(p, tokens);
  }
  @ApiOperation({ summary: '查询套餐、配额和用量汇总' })
  @RequireScopes('usage:read')
  @Get('usage/summary')
  summary(@CurrentPrincipal() p: Principal) {
    return this.service.summary(p);
  }
}
