import { Body, Controller, Get, Patch, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { db } from '@hub/db';
import {
  CurrentPrincipal,
  RequireRoles,
  type AuthRequest,
  type Principal,
} from '../common/auth.js';
@Controller('tenants/current')
export class TenantController {
  @Get() async current(@CurrentPrincipal() p: Principal) {
    const [row] = await db()`select id,name,slug,status from tenants where id=${p.tenantId}`;
    return row;
  }
  @Get('members') members(@CurrentPrincipal() p: Principal) {
    return db()`select u.id,u.email,u.display_name,tm.role from tenant_members tm join users u on u.id=tm.user_id where tm.tenant_id=${p.tenantId} order by u.email`;
  }
  @RequireRoles('owner', 'admin') @Post('members') async add(
    @Body() body: unknown,
    @CurrentPrincipal() p: Principal,
    @Req() req: AuthRequest,
  ) {
    const x = z
      .object({ email: z.email(), role: z.enum(['admin', 'editor', 'member', 'viewer']) })
      .parse(body);
    const [u] = await db()`select id from users where lower(email)=lower(${x.email})`;
    if (!u) throw new Error('USER_NOT_FOUND');
    await db()`insert into tenant_members(tenant_id,user_id,role) values(${p.tenantId},${u.id},${x.role}) on conflict(tenant_id,user_id) do update set role=excluded.role`;
    await db()`insert into audit_logs(tenant_id,actor_user_id,action,resource_type,resource_id,request_id,after_json) values(${p.tenantId},${p.userId},'member.upsert','tenant_member',${u.id},${req.requestId},${db().json(x)})`;
    return { ok: true };
  }
  @RequireRoles('owner', 'admin') @Patch('members') async role(
    @Body() body: unknown,
    @CurrentPrincipal() p: Principal,
    @Req() req: AuthRequest,
  ) {
    const x = z
      .object({ userId: z.uuid(), role: z.enum(['admin', 'editor', 'member', 'viewer']) })
      .parse(body);
    await db()`update tenant_members set role=${x.role} where tenant_id=${p.tenantId} and user_id=${x.userId} and role<>'owner'`;
    await db()`insert into audit_logs(tenant_id,actor_user_id,action,resource_type,resource_id,request_id,after_json) values(${p.tenantId},${p.userId},'member.role.update','tenant_member',${x.userId},${req.requestId},${db().json(x)})`;
    return { ok: true };
  }
}
