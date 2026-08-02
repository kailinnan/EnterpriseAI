import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { CurrentPrincipal, RequireRoles, type Principal } from '../common/auth.js';
import { KnowledgeService } from './knowledge.service.js';
const id = (x: string) => z.uuid().parse(x);
@Controller()
export class KnowledgeController {
  constructor(private readonly service: KnowledgeService) {}
  @RequireRoles('owner', 'admin', 'editor') @Post('knowledge-bases') create(
    @Body() body: unknown,
    @CurrentPrincipal() p: Principal,
  ) {
    const x = z
      .object({
        name: z.string().min(1),
        description: z.string().default(''),
        embeddingModelConfigId: z.uuid().optional(),
        chunkConfig: z
          .object({
            chunkTokens: z.number().int().min(100).max(4000),
            overlapTokens: z.number().int().min(0).max(1000),
            minChunkTokens: z.number().int().min(1).max(1000),
          })
          .optional(),
      })
      .parse(body);
    return this.service.create(p, x);
  }
  @Get('knowledge-bases') list(@CurrentPrincipal() p: Principal) {
    return this.service.list(p);
  }
  @Get('knowledge-bases/:id') one(@Param('id') x: string, @CurrentPrincipal() p: Principal) {
    return this.service.one(p, id(x));
  }
  @RequireRoles('owner', 'admin', 'editor')
  @Post('knowledge-bases/:id/documents')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: Number(process.env.MAX_UPLOAD_BYTES ?? 20971520) },
    }),
  )
  upload(
    @Param('id') x: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentPrincipal() p: Principal,
  ) {
    if (!file) throw new Error('FILE_REQUIRED');
    return this.service.upload(p, id(x), file);
  }
  @Get('knowledge-bases/:id/documents') documents(
    @Param('id') x: string,
    @CurrentPrincipal() p: Principal,
  ) {
    return this.service.documents(p, id(x));
  }
  @Get('documents/:id/chunks') chunks(@Param('id') x: string, @CurrentPrincipal() p: Principal) {
    return this.service.chunks(p, id(x));
  }
  @RequireRoles('owner', 'admin', 'editor') @Post('documents/:id/reindex') reindex(
    @Param('id') x: string,
    @CurrentPrincipal() p: Principal,
  ) {
    return this.service.reindex(p, id(x));
  }
  @RequireRoles('owner', 'admin', 'editor') @Delete('documents/:id') remove(
    @Param('id') x: string,
    @CurrentPrincipal() p: Principal,
  ) {
    return this.service.remove(p, id(x));
  }
}
