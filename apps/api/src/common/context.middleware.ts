import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import type { AuthRequest } from './auth.js';
import { randomUUID } from 'node:crypto';
@Injectable()
export class ContextMiddleware implements NestMiddleware {
  use(req: AuthRequest, res: Response, next: NextFunction) {
    req.requestId = String(req.headers['x-request-id'] ?? randomUUID());
    req.traceId = String(req.headers['x-trace-id'] ?? randomUUID());
    res.setHeader('x-request-id', req.requestId);
    res.setHeader('x-trace-id', req.traceId);
    next();
  }
}
