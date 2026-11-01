import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { isAdmin, JwtUser } from './config';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException();
    }

    try {
      // Secret comes from JwtModule config (no hardcoded fallback)
      const payload = await this.jwtService.verifyAsync<JwtUser>(token);
      if (!payload?.id) throw new Error('Invalid payload');
      request['user'] = payload;
    } catch {
      throw new UnauthorizedException();
    }
    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}

/** Must be used after AuthGuard. Restricts to emails listed in ADMIN_EMAILS. */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user: JwtUser | undefined = context.switchToHttp().getRequest()['user'];
    if (!isAdmin(user?.email)) {
      throw new ForbiddenException('Admin only');
    }
    return true;
  }
}
