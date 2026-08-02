import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Response } from 'express';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import { tap } from 'rxjs/operators';
import { logger } from '@hub/logger';
import type { AuthRequest } from './auth.js';
export const metrics = new Registry();
collectDefaultMetrics({ register: metrics, prefix: 'enterprise_ai_hub_' });
const requests = new Counter({
  name: 'http_requests_total',
  help: 'HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [metrics],
});
const duration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP duration',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60],
  registers: [metrics],
});
const errors = new Counter({
  name: 'http_errors_total',
  help: 'HTTP responses with status 4xx or 5xx',
  labelNames: ['method', 'route', 'status'],
  registers: [metrics],
});
export const modelLatency = new Histogram({
  name: 'model_latency_seconds',
  help: 'Model latency',
  labelNames: ['model'],
  registers: [metrics],
});
export const retrievalLatency = new Histogram({
  name: 'retrieval_latency_seconds',
  help: 'Retrieval latency',
  registers: [metrics],
});
export const firstTokenLatency = new Histogram({
  name: 'first_token_latency_seconds',
  help: 'First token latency',
  registers: [metrics],
});
export const queueBacklog = new Gauge({
  name: 'document_queue_jobs',
  help: 'Document queue jobs',
  labelNames: ['state'],
  registers: [metrics],
});
@Injectable()
export class ObservabilityInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler) {
    const req = ctx.switchToHttp().getRequest<AuthRequest>();
    const res = ctx.switchToHttp().getResponse<Response>();
    const started = process.hrtime.bigint();
    return next.handle().pipe(
      tap({
        finalize: () => {
          const seconds = Number(process.hrtime.bigint() - started) / 1e9;
          const labels = {
            method: req.method,
            route: req.route?.path ?? req.path,
            status: String(res.statusCode),
          };
          requests.inc(labels);
          if (res.statusCode >= 400) errors.inc(labels);
          duration.observe(labels, seconds);
          logger.info(
            {
              requestId: req.requestId,
              traceId: req.traceId,
              tenantId: req.principal?.tenantId,
              method: req.method,
              path: req.path,
              status: res.statusCode,
              durationMs: Math.round(seconds * 1000),
            },
            'request.completed',
          );
        },
      }),
    );
  }
}
