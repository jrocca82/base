export type Env = {
  PORT: number;
  SUPABASE_URL: string;
  SUPABASE_SECRET_KEY: string;
};

const requiredKeys = ['SUPABASE_URL', 'SUPABASE_SECRET_KEY'] as const;

export function validateEnv(raw: Record<string, unknown>): Env {
  const missing = requiredKeys.filter((key) => !raw[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. Copy .env.example to .env and fill them in.`,
    );
  }

  const port = Number(raw.PORT ?? 8000);

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(
      `PORT must be a positive integer, received "${String(raw.PORT)}"`,
    );
  }

  return {
    PORT: port,
    SUPABASE_URL: String(raw.SUPABASE_URL),
    SUPABASE_SECRET_KEY: String(raw.SUPABASE_SECRET_KEY),
  };
}
