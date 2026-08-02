import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { AuthService } from './auth.service.js';
import { CurrentPrincipal, Public, type AuthRequest, type Principal } from '../common/auth.js';
const login = z.object({
  email: z.email(),
  password: z.string().min(8),
  tenantId: z.uuid().optional(),
});
const tenant = z.object({
  name: z.string().min(2).max(100),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  email: z.email(),
  password: z.string().min(12),
  displayName: z.string().min(1),
});
@Controller('auth')
export class AuthController {
  constructor(private readonly service: AuthService) {}
  @Public() @Post('login') async login(
    @Body() body: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = login.parse(body);
    const result = await this.service.login(input.email, input.password, input.tenantId, req);
    res.cookie('refresh_token', result.refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/api/v1/auth',
    });
    return { accessToken: result.accessToken, user: result.principal };
  }
  @Public() @Post('refresh') async refresh(
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.service.refresh(String(req.cookies?.refresh_token ?? ''));
    res.cookie('refresh_token', result.refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/api/v1/auth',
    });
    return { accessToken: result.accessToken };
  }
  @Post('logout') async logout(@Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    await this.service.logout(String(req.cookies?.refresh_token ?? ''));
    res.clearCookie('refresh_token', { path: '/api/v1/auth' });
    return { ok: true };
  }
  @Get('me') me(@CurrentPrincipal() p: Principal) {
    return p;
  }
  @Public() @Post('register-tenant') register(@Body() body: unknown, @Req() req: AuthRequest) {
    const x = tenant.parse(body);
    return this.service.createTenant(x.name, x.slug, x.email, x.password, x.displayName, req);
  }
}
