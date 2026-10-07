# Template

Turborepo template: Vite + React frontend, NestJS API, Supabase, shadcn/ui.

## Stack

| Workspace                    | What                                                           |
| ---------------------------- | -------------------------------------------------------------- |
| `apps/web`                   | Vite 8 + React 19, Tailwind CSS v4, consumes `@repo/ui`        |
| `apps/api`                   | NestJS 11, validated env, Supabase guard for bearer-token auth |
| `packages/ui`                | shadcn/ui components (new-york, zinc) + Tailwind theme tokens  |
| `packages/database`          | Generated Supabase types, shared by web and api                |
| `packages/typescript-config` | `base` / `nest` / `vite` / `react-library` presets             |
| `packages/eslint-config`     | `base` / `nest` / `react-vite` / `react-internal` presets      |

TypeScript is pinned workspace-wide through the pnpm `catalog:` in `pnpm-workspace.yaml`.
It stays on 6.x because the Nest CLI needs the programmatic compiler API, which
TypeScript 7.0 dropped until 7.1.

## Setup

```sh
pnpm install
supabase start
```

`supabase start` prints a publishable key and a secret key. Then:

```sh
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Fill in `SUPABASE_SECRET_KEY` (api, server-only — bypasses row level security)
and `VITE_SUPABASE_PUBLISHABLE_KEY` (web, safe to expose — row level security
applies). These replace the legacy `service_role` and `anon` keys, which
Supabase deletes at the end of 2026.

The api throws at boot if either required variable is missing.

## Develop

```sh
pnpm dev
```

Web on `:3000`, api on `:8000`. The api mounts everything under `/api`, and Vite
proxies `/api` to it, so the same paths work in dev and production.

## Database types

`packages/database/index.ts` ships a placeholder `Database` type. Once you have a
schema:

```sh
cd packages/database && pnpm generate-types
```

## Adding UI components

Components live in `packages/ui` so every app shares them:

```sh
cd packages/ui && pnpm dlx shadcn@latest add dialog table
```

The CLI sometimes rewrites the `utils` alias to a bare `cn` import and installs an
unrelated `cn` package. Check that new files import from `@repo/ui/lib/utils`.

Tailwind scans `packages/ui/src` via the `@source` directive in
`apps/web/src/index.css` — adding another app means adding that directive there too.

## Scripts

```sh
pnpm dev           # all apps in watch mode
pnpm build         # all apps
pnpm lint          # eslint
pnpm check-types   # tsc --noEmit
pnpm format        # prettier
```
