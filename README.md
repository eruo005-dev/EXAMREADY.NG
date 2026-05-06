# ExamReady.ng

Nigeria's most trusted online exam prep platform. AI-powered adaptive learning for JAMB, WAEC, NECO, GCE, Post-UTME, NABTEB, and professional exams.

> Sprint 0 scaffolding in progress. Detailed setup, deployment, and operations guide will be filled in as milestones complete.

## Tech stack

- **Monorepo:** pnpm workspaces + Turborepo
- **Frontend:** Next.js 14 App Router, TypeScript, Tailwind CSS, shadcn/ui
- **Backend:** Next.js Route Handlers (Vercel Serverless), Drizzle ORM, Postgres
- **Auth:** Supabase Auth (phone OTP via Termii hook, email, Google)
- **Database:** Supabase Postgres + Realtime + Storage
- **Cache & rate-limit:** Upstash Redis
- **Background jobs:** Upstash QStash
- **Scheduled jobs:** Vercel Cron
- **Payments:** Paystack (NGN only)
- **Notifications:** Termii (WhatsApp + SMS), Resend (email)
- **Hosting:** Vercel

## Repository layout

```
apps/
  web/        # Student-facing PWA + API routes (Vercel project #1)
  admin/      # Admin dashboard (Vercel project #2)
packages/
  db/         # Drizzle schema, migrations, seed
  shared/     # Zod schemas, TypeScript types, constants
  ui/         # shadcn/ui components
  notifications/  # WhatsApp + SMS + Email service
  config/     # Shared ESLint, TypeScript, Tailwind configs
```

## Quick start (local dev)

```bash
# 1. Install dependencies
pnpm install

# 2. Start local Postgres + Redis + Meilisearch
docker compose up -d

# 3. Run migrations + seed
pnpm db:migrate
pnpm db:seed

# 4. Start the dev server
pnpm dev
```

The student app boots at `http://localhost:3000`, admin at `http://localhost:3001`.

## Documentation

Full setup, deployment, AdSense application checklist, Termii template registration, Paystack integration, and operations runbook will be added as Sprint 0 milestones complete. See `.env.example` for the full list of required environment variables.

## License

UNLICENSED — proprietary, all rights reserved.
