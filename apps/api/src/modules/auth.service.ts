import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  OnModuleDestroy,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { db } from '@hub/db';
import { tokenHash } from '../common/security.js';
import type { AuthRequest, Principal } from '../common/auth.js';
import { Redis } from 'ioredis';
@Injectable()
export class AuthService implements OnModuleDestroy {
  constructor(private readonly jwt: JwtService) {}
  private readonly redis = new Redis(String(process.env.REDIS_URL), {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  async onModuleDestroy() {
    if (this.redis.status !== 'end') await this.redis.quit();
  }
  async login(email: string, password: string, tenantId: string | undefined, req: AuthRequest) {
    if (this.redis.status === 'wait') await this.redis.connect();
    const attemptKey = `auth:login:${tokenHash(`${req.ip ?? 'unknown'}:${email.toLowerCase()}`)}`;
    const attempts = await this.redis.incr(attemptKey);
    if (attempts === 1) await this.redis.expire(attemptKey, 900);
    if (attempts > 10)
      throw new HttpException({ code: 'LOGIN_RATE_LIMITED' }, HttpStatus.TOO_MANY_REQUESTS);
    const rows =
      await db()`select u.id,u.email,u.password_hash,tm.tenant_id,tm.role from users u join tenant_members tm on tm.user_id=u.id where lower(u.email)=lower(${email}) ${tenantId ? db()`and tm.tenant_id=${tenantId}` : db()``} order by tm.created_at limit 1`;
    const row = rows[0];
    if (!row || !(await argon2.verify(String(row.password_hash), password)))
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
    await this.redis.del(attemptKey);
    const principal: Principal = {
      userId: String(row.id),
      tenantId: String(row.tenant_id),
      role: String(row.role) as Principal['role'],
      email: String(row.email),
    };
    const tokens = await this.issue(principal);
    await this.audit(principal, 'auth.login', 'user', principal.userId, req);
    return { ...tokens, principal };
  }
  async refresh(raw: string) {
    let payload: Principal & { familyId: string };
    try {
      payload = await this.jwt.verifyAsync(raw, { secret: String(process.env.JWT_REFRESH_SECRET) });
    } catch {
      throw new UnauthorizedException({ code: 'REFRESH_INVALID' });
    }
    const hash = tokenHash(raw);
    const [stored] =
      await db()`select id from refresh_tokens where tenant_id=${payload.tenantId} and user_id=${payload.userId} and token_hash=${hash} and revoked_at is null and expires_at>now()`;
    if (!stored) {
      await db()`update refresh_tokens set revoked_at=coalesce(revoked_at,now()) where tenant_id=${payload.tenantId} and user_id=${payload.userId} and family_id=${payload.familyId}`;
      throw new UnauthorizedException({ code: 'REFRESH_REVOKED' });
    }
    await db()`update refresh_tokens set revoked_at=now() where tenant_id=${payload.tenantId} and id=${stored.id}`;
    return this.issue(payload, payload.familyId);
  }
  async logout(raw: string | undefined) {
    if (raw)
      await db()`update refresh_tokens set revoked_at=now() where token_hash=${tokenHash(raw)}`;
  }
  private async issue(p: Principal, familyId: string = randomUUID()) {
    const accessToken = await this.jwt.signAsync(p, {
      secret: String(process.env.JWT_ACCESS_SECRET),
      expiresIn: accessTokenTtlSeconds(),
    });
    const days = Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 30);
    const refreshToken = await this.jwt.signAsync(
      { ...p, familyId },
      { secret: String(process.env.JWT_REFRESH_SECRET), expiresIn: days * 86400 },
    );
    await db()`insert into refresh_tokens(tenant_id,user_id,token_hash,family_id,expires_at) values(${p.tenantId},${p.userId},${tokenHash(refreshToken)},${familyId},now()+(${days}||' days')::interval)`;
    return { accessToken, refreshToken };
  }
  async createTenant(
    name: string,
    slug: string,
    email: string,
    password: string,
    displayName: string,
    req: AuthRequest,
  ) {
    if (password.length < 12) throw new BadRequestException({ code: 'WEAK_PASSWORD' });
    const hash = await argon2.hash(password);
    return db().begin(async (tx) => {
      const [t] =
        await tx`insert into tenants(name,slug) values(${name},${slug}) returning id,name,slug`;
      const [u] =
        await tx`insert into users(email,password_hash,display_name) values(${email},${hash},${displayName}) on conflict(email) do update set display_name=excluded.display_name returning id,email`;
      if (!t || !u) throw new Error('CREATE_FAILED');
      await tx`insert into tenant_members(tenant_id,user_id,role) values(${t.id},${u.id},'owner')`;
      await tx`insert into tenant_subscriptions(tenant_id,plan_id) select ${t.id},id from plans where code='development' on conflict(tenant_id) do nothing`;
      const [provider] =
        await tx`insert into model_providers(tenant_id,provider_type,name,enabled) values(${t.id},'mock','Development Mock',true) returning id`;
      if (provider)
        await tx`insert into model_configs(tenant_id,provider_id,model_name,capability_json,input_price,output_price,enabled) values(${t.id},${provider.id},'mock-chat',${tx.json({ capabilities: ['chat', 'embedding'], embeddingDimensions: 1536 })},0,0,true)`;
      await tx`insert into audit_logs(tenant_id,actor_user_id,action,resource_type,resource_id,request_id,ip,user_agent,after_json) values(${t.id},${u.id},'tenant.create','tenant',${t.id},${req.requestId},${req.ip ?? null},${req.headers['user-agent'] ?? null},${tx.json(t)})`;
      return t;
    });
  }
  async createForUser(p: Principal, name: string, slug: string, req: AuthRequest) {
    return db().begin(async (tx) => {
      const [tenant] = await tx`insert into tenants(name,slug) values(${name},${slug}) returning *`;
      if (!tenant) throw new Error('TENANT_CREATE_FAILED');
      await tx`insert into tenant_members(tenant_id,user_id,role) values(${tenant.id},${p.userId},'owner')`;
      await tx`insert into tenant_subscriptions(tenant_id,plan_id) select ${tenant.id},id from plans where code='development' on conflict(tenant_id) do nothing`;
      const [provider] =
        await tx`insert into model_providers(tenant_id,provider_type,name,enabled) values(${tenant.id},'mock','Development Mock',true) returning id`;
      if (provider)
        await tx`insert into model_configs(tenant_id,provider_id,model_name,capability_json,input_price,output_price,enabled) values(${tenant.id},${provider.id},'mock-chat',${tx.json({ capabilities: ['chat', 'embedding'], embeddingDimensions: 1536 })},0,0,true)`;
      await tx`insert into audit_logs(tenant_id,actor_user_id,action,resource_type,resource_id,request_id,ip,user_agent) values(${tenant.id},${p.userId},'tenant.create','tenant',${tenant.id},${req.requestId},${req.ip ?? null},${req.headers['user-agent'] ?? null})`;
      return tenant;
    });
  }
  async switchTenant(p: Principal, tenantId: string, req: AuthRequest) {
    const [membership] =
      await db()`select t.id,t.name,t.slug,tm.role,u.email from tenant_members tm join tenants t on t.id=tm.tenant_id join users u on u.id=tm.user_id where tm.user_id=${p.userId} and tm.tenant_id=${tenantId} and t.status='active'`;
    if (!membership) throw new UnauthorizedException({ code: 'TENANT_ACCESS_DENIED' });
    const principal: Principal = {
      userId: p.userId,
      tenantId,
      email: String(membership.email),
      role: String(membership.role) as Principal['role'],
    };
    const tokens = await this.issue(principal);
    await this.audit(principal, 'tenant.switch', 'tenant', tenantId, req);
    return { ...tokens, principal, tenant: membership };
  }
  private async audit(p: Principal, action: string, type: string, id: string, req: AuthRequest) {
    await db()`insert into audit_logs(tenant_id,actor_user_id,action,resource_type,resource_id,request_id,ip,user_agent) values(${p.tenantId},${p.userId},${action},${type},${id},${req.requestId},${req.ip ?? null},${req.headers['user-agent'] ?? null})`;
  }
}

const accessTokenTtlSeconds = (): number => {
  const value = process.env.ACCESS_TOKEN_TTL ?? '15m';
  const match = value.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return 900;
  const amount = Number(match[1]);
  const multiplier = { s: 1, m: 60, h: 3600, d: 86400 }[match[2] as 's' | 'm' | 'h' | 'd'];
  return amount * multiplier;
};
