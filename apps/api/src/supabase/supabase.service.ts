import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Database } from '@repo/database';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../config/env';

@Injectable()
export class SupabaseService {
  private readonly supabaseAdmin: SupabaseClient<Database>;

  constructor(config: ConfigService<Env, true>) {
    this.supabaseAdmin = createClient<Database>(
      config.get('SUPABASE_URL', { infer: true }),
      config.get('SUPABASE_SECRET_KEY', { infer: true }),
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  }

  get client(): SupabaseClient<Database> {
    return this.supabaseAdmin;
  }
}
