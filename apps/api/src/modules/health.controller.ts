import { Controller, Get } from '@nestjs/common';
import { S3Client, ListBucketsCommand } from '@aws-sdk/client-s3';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { db } from '@hub/db';
import { Public } from '../common/auth.js';
import { queueBacklog } from '../common/observability.js';
@Controller('health')
export class HealthController {
  @Public() @Get('live') live() {
    return { status: 'ok' };
  }
  @Public() @Get('ready') async ready() {
    const checks: { postgres: boolean; redis: boolean; minio: boolean; queue: boolean } = {
      postgres: false,
      redis: false,
      minio: false,
      queue: false,
    };
    try {
      await db()`select 1`;
      checks.postgres = true;
    } catch {
      checks.postgres = false;
    }
    const redis = new Redis(String(process.env.REDIS_URL), {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    try {
      await redis.connect();
      checks.redis = (await redis.ping()) === 'PONG';
      const queue = new Queue('documents', { connection: { url: String(process.env.REDIS_URL) } });
      const counts = await queue.getJobCounts('waiting', 'active', 'failed');
      for (const state of ['waiting', 'active', 'failed'] as const)
        queueBacklog.set({ state }, counts[state] ?? 0);
      checks.queue = true;
      await queue.close();
    } catch {
      checks.redis = false;
      checks.queue = false;
    } finally {
      redis.disconnect();
    }
    try {
      const s3 = new S3Client({
        endpoint: String(process.env.S3_ENDPOINT),
        region: process.env.S3_REGION ?? 'us-east-1',
        forcePathStyle: true,
        credentials: {
          accessKeyId: String(process.env.S3_ACCESS_KEY),
          secretAccessKey: String(process.env.S3_SECRET_KEY),
        },
      });
      await s3.send(new ListBucketsCommand({}));
      checks.minio = true;
    } catch {
      checks.minio = false;
    }
    return { status: Object.values(checks).every(Boolean) ? 'ok' : 'degraded', checks };
  }
}
