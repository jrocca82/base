import { Module } from '@nestjs/common';
import { SupabaseGuard } from './supabase.guard';
import { SupabaseService } from './supabase.service';

@Module({
  providers: [SupabaseService, SupabaseGuard],
  exports: [SupabaseService, SupabaseGuard],
})
export class SupabaseModule {}
