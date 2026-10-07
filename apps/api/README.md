# api

NestJS API. See the [repo README](../../README.md) for setup.

Routes are mounted under the `/api` prefix. Environment variables are validated
at boot by `src/config/env.ts` — the process exits if any required value is
missing.

Protect a route with the Supabase guard:

```ts
import { UseGuards, Req, Get } from '@nestjs/common';
import { SupabaseGuard, type AuthenticatedRequest } from './supabase/supabase.guard';

@Get('me')
@UseGuards(SupabaseGuard)
getMe(@Req() request: AuthenticatedRequest) {
  return request.user;
}
```
