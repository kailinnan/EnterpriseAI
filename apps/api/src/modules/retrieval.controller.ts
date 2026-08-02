import { Body, Controller, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentPrincipal, RequireScopes, type Principal } from '../common/auth.js';
import { RetrievalService } from './retrieval.service.js';
@Controller('retrieval')
export class RetrievalController {
  constructor(private readonly service: RetrievalService) {}
  @RequireScopes('knowledge:read') @Post('debug') debug(
    @Body() body: unknown,
    @CurrentPrincipal() p: Principal,
  ) {
    const x = z
      .object({
        knowledgeBaseIds: z.array(z.uuid()).min(1),
        query: z.string().min(1).max(4000),
        topK: z.number().int().min(1).max(30).optional(),
        filters: z
          .object({
            documentIds: z.array(z.uuid()).optional(),
            tags: z.array(z.string()).optional(),
            createdAfter: z.iso.datetime().optional(),
          })
          .optional(),
      })
      .parse(body);
    return this.service.search(p, x);
  }
}
