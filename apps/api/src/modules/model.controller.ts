import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentPrincipal, RequireRoles, type Principal } from '../common/auth.js';
import { ModelService } from './model.service.js';
@Controller()
export class ModelController {
  constructor(private readonly service: ModelService) {}
  @RequireRoles('owner', 'admin') @Post('model-providers') create(
    @Body() body: unknown,
    @CurrentPrincipal() p: Principal,
  ) {
    const x = z
      .object({
        providerType: z.enum(['openai', 'openai-compatible', 'mock']),
        name: z.string().min(1),
        baseUrl: z.url().optional(),
        apiKey: z.string().min(1).optional(),
      })
      .parse(body);
    return this.service.createProvider(p, x);
  }
  @Get('model-providers') providers(@CurrentPrincipal() p: Principal) {
    return this.service.providers(p);
  }
  @RequireRoles('owner', 'admin') @Post('model-providers/:id/test') test(
    @Param('id') id: string,
    @CurrentPrincipal() p: Principal,
  ) {
    return this.service.test(p, z.uuid().parse(id));
  }
  @RequireRoles('owner', 'admin') @Post('models') config(
    @Body() body: unknown,
    @CurrentPrincipal() p: Principal,
  ) {
    const x = z
      .object({
        providerId: z.uuid(),
        modelName: z.string().min(1),
        inputPrice: z.number().nonnegative(),
        outputPrice: z.number().nonnegative(),
        capabilities: z.array(z.string()),
      })
      .parse(body);
    return this.service.addConfig(p, x);
  }
  @Get('models') models(@CurrentPrincipal() p: Principal) {
    return this.service.models(p);
  }
}
