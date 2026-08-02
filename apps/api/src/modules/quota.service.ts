import {
  CanActivate,
  ConflictException,
  ExecutionContext,
  Injectable,
  OnModuleDestroy,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Redis } from 'ioredis';
import { db } from '@hub/db';
import { tokenHash } from '../common/security.js';
import type { Principal } from '../common/auth.js';
type Limits = {
  monthlyTokens: number;
  dailyRequests: number;
  concurrentRuns: number;
  storageBytes: number;
  knowledgeBaseCount: number;
  assistantCount: number;
};
@Injectable()
export class QuotaService implements OnModuleDestroy {
  private readonly redis = new Redis(String(process.env.REDIS_URL), {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  async onModuleDestroy() {
    if (this.redis.status !== 'end') await this.redis.quit();
  }
  private async limits(tenantId: string): Promise<Limits> {
    const [row] =
      await db()`select p.limits_json from tenant_subscriptions s join plans p on p.id=s.plan_id where s.tenant_id=${tenantId} and s.status='active' and (s.ends_at is null or s.ends_at>now())`;
    if (!row) throw new ConflictException({ code: 'SUBSCRIPTION_REQUIRED' });
    return row.limits_json as Limits;
  }
  async precheck(p: Principal) {
    const limits = await this.limits(p.tenantId);
    if (this.redis.status === 'wait') await this.redis.connect();
    const day = new Date().toISOString().slice(0, 10);
    const rateKey = `rate:${p.tenantId}:${p.apiKeyId ?? 'user:' + p.userId}:${day}`;
    const requests = await this.redis.incr(rateKey);
    if (requests === 1) {
      const now = new Date();
      const nextDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
      await this.redis.expire(rateKey, Math.max(1, Math.ceil((nextDay - now.getTime()) / 1000)));
    }
    if (requests > limits.dailyRequests)
      throw new ConflictException({ code: 'QUOTA_DAILY_REQUESTS_EXCEEDED' });
    const [monthly] =
      await db()`select coalesce(sum(used-bonus),0)::numeric used from quota_buckets where tenant_id=${p.tenantId} and bucket_type='tokens' and period_start=date_trunc('month',now())::date`;
    if (Number(monthly?.used ?? 0) >= limits.monthlyTokens)
      throw new ConflictException({ code: 'QUOTA_MONTHLY_TOKENS_EXCEEDED' });
    return limits;
  }
  async assertResource(
    tenantId: string,
    type: 'knowledgeBaseCount' | 'assistantCount' | 'storageBytes',
    additional = 1,
  ) {
    const limits = await this.limits(tenantId);
    let used = 0;
    if (type === 'knowledgeBaseCount') {
      const [r] =
        await db()`select count(*)::int used from knowledge_bases where tenant_id=${tenantId}`;
      used = Number(r?.used ?? 0);
    } else if (type === 'assistantCount') {
      const [r] = await db()`select count(*)::int used from assistants where tenant_id=${tenantId}`;
      used = Number(r?.used ?? 0);
    } else {
      const [r] =
        await db()`select coalesce(sum(file_size),0)::bigint used from documents where tenant_id=${tenantId}`;
      used = Number(r?.used ?? 0);
    }
    if (used + additional > limits[type])
      throw new ConflictException({ code: `QUOTA_${type.toUpperCase()}_EXCEEDED` });
  }
  async assertConcurrent(tenantId: string) {
    const limits = await this.limits(tenantId);
    const [a] =
      await db()`select (select count(*) from agent_runs where tenant_id=${tenantId} and status='running')+(select count(*) from workflow_runs where tenant_id=${tenantId} and status='running') used`;
    if (Number(a?.used ?? 0) >= limits.concurrentRuns)
      throw new ConflictException({ code: 'QUOTA_CONCURRENT_RUNS_EXCEEDED' });
  }
  async settleTokens(tenantId: string, tokens: number) {
    await db()`insert into quota_buckets(tenant_id,bucket_type,period_start,used) values(${tenantId},'tokens',date_trunc('month',now())::date,${tokens}) on conflict(tenant_id,bucket_type,period_start) do update set used=quota_buckets.used+excluded.used,updated_at=now()`;
  }
  async createKey(p: Principal, input: { name: string; scopes: string[]; expiresAt?: string }) {
    const raw = `hub_${randomBytes(32).toString('base64url')}`;
    const [row] =
      await db()`insert into api_keys(tenant_id,name,key_hash,prefix,scopes,expires_at,created_by) values(${p.tenantId},${input.name},${tokenHash(raw)},${raw.slice(0, 12)},${db().json(input.scopes)},${input.expiresAt ?? null},${p.userId}) returning id,name,prefix,scopes,expires_at,created_at`;
    return { ...row, key: raw };
  }
  keys(p: Principal) {
    return db()`select id,name,prefix,scopes,expires_at,last_used_at,revoked_at,created_at from api_keys where tenant_id=${p.tenantId} order by created_at desc`;
  }
  async revoke(p: Principal, id: string) {
    await db()`update api_keys set revoked_at=now() where tenant_id=${p.tenantId} and id=${id}`;
    return { ok: true };
  }
  async credit(p: Principal, amount: number) {
    await db()`insert into quota_buckets(tenant_id,bucket_type,period_start,bonus) values(${p.tenantId},'tokens',date_trunc('month',now())::date,${amount}) on conflict(tenant_id,bucket_type,period_start) do update set bonus=quota_buckets.bonus+excluded.bonus,updated_at=now()`;
    return { ok: true };
  }
  async summary(p: Principal) {
    const [limits, usage, buckets] = await Promise.all([
      this.limits(p.tenantId),
      db()`select coalesce(sum(input_tokens+output_tokens+embedding_tokens),0)::text tokens,coalesce(sum(estimated_cost),0)::text cost from usage_records where tenant_id=${p.tenantId} and created_at>=date_trunc('month',now())`,
      db()`select bucket_type,used::text,bonus::text,period_start from quota_buckets where tenant_id=${p.tenantId} order by period_start desc`,
    ]);
    return { limits, usage: usage[0], buckets };
  }
}
@Injectable()
export class QuotaGuard implements CanActivate {
  constructor(private readonly quota: QuotaService) {}
  async canActivate(ctx: ExecutionContext) {
    const principal = ctx.switchToHttp().getRequest<{ principal?: Principal }>().principal;
    if (!principal) return true;
    await this.quota.precheck(principal);
    return true;
  }
}
