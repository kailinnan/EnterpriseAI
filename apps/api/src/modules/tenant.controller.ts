import { Body, Controller, Get, Param, Patch, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { db } from '@hub/db';
import {
  CurrentPrincipal,
  RequireRoles,
  type AuthRequest,
  type Principal,
} from '../common/auth.js';
import { AuthService } from './auth.service.js';

@Controller('tenants')
export class TenantController {
  constructor(private readonly auth: AuthService) {}

  @Get() list(@CurrentPrincipal() p: Principal) {
    return db()`select t.id,t.name,t.slug,t.status,tm.role from tenant_members tm join tenants t on t.id=tm.tenant_id where tm.user_id=${p.userId} order by t.name`;
  }

  @RequireRoles('owner') @Post() create(
    @Body() body: unknown,
    @CurrentPrincipal() p: Principal,
    @Req() req: AuthRequest,
  ) {
    const input = z
      .object({ name: z.string().min(2).max(100), slug: z.string().regex(/^[a-z0-9-]+$/) })
      .parse(body);
    return this.auth.createForUser(p, input.name, input.slug, req);
  }

  @Post(':id/switch') async switchTenant(
    @Param('id') id: string,
    @CurrentPrincipal() p: Principal,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.switchTenant(p, z.uuid().parse(id), req);
    res.cookie('refresh_token', result.refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/api/v1/auth',
    });
    return { accessToken: result.accessToken, user: result.principal, tenant: result.tenant };
  }

  @Get('current') async current(@CurrentPrincipal() p: Principal) {
    const [row] = await db()`select id,name,slug,status from tenants where id=${p.tenantId}`;
    return row;
  }

  @Get('current/members') members(@CurrentPrincipal() p: Principal) {
    return db()`select u.id,u.email,u.display_name,tm.role from tenant_members tm join users u on u.id=tm.user_id where tm.tenant_id=${p.tenantId} order by u.email`;
  }

  @RequireRoles('owner', 'admin') @Post('current/members') async add(
    @Body() body: unknown,
    @CurrentPrincipal() p: Principal,
    @Req() req: AuthRequest,
  ) {
    const input = z
      .object({ email: z.email(), role: z.enum(['admin', 'editor', 'member', 'viewer']) })
      .parse(body);
    const [user] = await db()`select id from users where lower(email)=lower(${input.email})`;
    if (!user) throw new Error('USER_NOT_FOUND');
    await db()`insert into tenant_members(tenant_id,user_id,role) values(${p.tenantId},${user.id},${input.role}) on conflict(tenant_id,user_id) do update set role=excluded.role`;
    await db()`insert into audit_logs(tenant_id,actor_user_id,action,resource_type,resource_id,request_id,after_json) values(${p.tenantId},${p.userId},'member.upsert','tenant_member',${user.id},${req.requestId},${db().json(input)})`;
    return { ok: true };
  }

  @RequireRoles('owner', 'admin') @Patch('current/members') async role(
    @Body() body: unknown,
    @CurrentPrincipal() p: Principal,
    @Req() req: AuthRequest,
  ) {
    const input = z
      .object({ userId: z.uuid(), role: z.enum(['admin', 'editor', 'member', 'viewer']) })
      .parse(body);
    await db()`update tenant_members set role=${input.role} where tenant_id=${p.tenantId} and user_id=${input.userId} and role<>'owner'`;
    await db()`insert into audit_logs(tenant_id,actor_user_id,action,resource_type,resource_id,request_id,after_json) values(${p.tenantId},${p.userId},'member.role.update','tenant_member',${input.userId},${req.requestId},${db().json(input)})`;
    return { ok: true };
  }
}
