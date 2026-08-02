import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  ForbiddenException,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { Role } from '@hub/contracts';
export type Principal = {
  userId: string;
  tenantId: string;
  role: Role;
  email: string;
  authType?: 'jwt' | 'api_key';
  scopes?: string[];
  apiKeyId?: string;
};
export type AuthRequest = Request & { principal?: Principal; requestId: string; traceId: string };
export const PUBLIC = 'public';
export const Public = () => SetMetadata(PUBLIC, true);
export const ROLES = 'roles';
export const RequireRoles = (...roles: Role[]) => SetMetadata(ROLES, roles);
export const SCOPES = 'scopes';
export const RequireScopes = (...scopes: string[]) => SetMetadata(SCOPES, scopes);
export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Principal => {
    const p = ctx.switchToHttp().getRequest<AuthRequest>().principal;
    if (!p) throw new UnauthorizedException();
    return p;
  },
);
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}
  async canActivate(ctx: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC, [ctx.getHandler(), ctx.getClass()]))
      return true;
    const req = ctx.switchToHttp().getRequest<AuthRequest>();
    const token = req.headers.authorization?.replace(/^Bearer /, '');
    if (!token) throw new UnauthorizedException({ code: 'AUTH_REQUIRED' });
    if (token.startsWith('hub_')) {
      const { db } = await import('@hub/db');
      const { tokenHash } = await import('./security.js');
      const [key] =
        await db()`select ak.id,ak.tenant_id,ak.scopes,ak.created_by,u.email,tm.role from api_keys ak join users u on u.id=ak.created_by join tenant_members tm on tm.tenant_id=ak.tenant_id and tm.user_id=ak.created_by where ak.key_hash=${tokenHash(token)} and ak.revoked_at is null and (ak.expires_at is null or ak.expires_at>now())`;
      if (!key) throw new UnauthorizedException({ code: 'API_KEY_INVALID' });
      req.principal = {
        userId: String(key.created_by),
        tenantId: String(key.tenant_id),
        role: String(key.role) as Role,
        email: String(key.email),
        authType: 'api_key',
        scopes: key.scopes as string[],
        apiKeyId: String(key.id),
      };
      await db()`update api_keys set last_used_at=now() where tenant_id=${key.tenant_id} and id=${key.id}`;
      return true;
    }
    try {
      req.principal = await this.jwt.verifyAsync<Principal>(token, {
        secret: String(process.env.JWT_ACCESS_SECRET),
      });
      return true;
    } catch {
      throw new UnauthorizedException({ code: 'TOKEN_INVALID' });
    }
  }
}
@Injectable()
export class ScopesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(ctx: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<string[]>(SCOPES, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required) return true;
    const p = ctx.switchToHttp().getRequest<AuthRequest>().principal;
    if (p?.authType !== 'api_key') return true;
    if (!required.every((scope) => p.scopes?.includes(scope)))
      throw new ForbiddenException({ code: 'API_KEY_SCOPE_FORBIDDEN' });
    return true;
  }
}
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(ctx: ExecutionContext) {
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!roles) return true;
    const p = ctx.switchToHttp().getRequest<AuthRequest>().principal;
    if (!p || !roles.includes(p.role)) throw new ForbiddenException({ code: 'ROLE_FORBIDDEN' });
    return true;
  }
}
