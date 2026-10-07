import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { User } from '@supabase/supabase-js';
import type { Request } from 'express';
import { SupabaseService } from './supabase.service';

export type AuthenticatedRequest = Request & { user: User };

@Injectable()
export class SupabaseGuard implements CanActivate {
  constructor(private supabaseService: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.headers.authorization?.split(' ')[1];

    if (!token) throw new UnauthorizedException('Missing token');

    const {
      data: { user },
      error,
    } = await this.supabaseService.client.auth.getUser(token);

    if (error || !user) throw new UnauthorizedException('Invalid session');

    (request as AuthenticatedRequest).user = user;
    return true;
  }
}
