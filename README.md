# Trios Snow and Mowing Inc.

Full property-care platform for St. John’s, Newfoundland and Labrador. Next.js 16 / React 19, PostgreSQL, Supabase verified email sign-in and private storage.

## Features

- Public service catalogue, seasonal plans, service areas, contact and care planner.
- Multi-step quote requests with saved drafts, property details and photos.
- Customer portal for properties, quotes, visits, invoices and messages.
- Separate staff sign-in, administrator operations and crew assignments.
- Scheduling, capacity checks, quotes and approvals, invoices and verified payment records.
- Customer data isolation, server role checks, private downloads, version guards and idempotent operations.
- Mobile navigation with safe-area support, accessible form progression, large touch targets and responsive working screens.

## Local development

Use Node.js 22.13 or newer. Run `npm ci`, copy `.env.example` to `.env.local`, fill the dedicated project's values, then run `npm run dev`.

`npm run build` creates the native Next.js production build for Vercel. `npm run typecheck` and `npm test` validate types, access controls, workflows, session transitions and PostgreSQL constraints.

## Vercel activation

Import `Emmanuelok/triosservices` into the intended Vercel team. Keep the Next.js framework preset and the repository root. The repository includes `vercel.json`; no Cloudflare build is required.

Before opening online accounts to customers:

1. Create/select a **dedicated Trios Supabase project**. Do not reuse an unrelated application's database or auth tenant without an explicit decision.
2. Add the environment variables in `.env.example` to Vercel. `DATABASE_URL` is the project's pooled PostgreSQL connection; `SUPABASE_SERVICE_ROLE_KEY` must stay server-only. Set `OWNER_EMAILS` to the exact verified administrator email addresses. Set `SITE_ORIGIN` to the production origin.
3. Run `npm run db:migrate` with that database URL. It applies transactional, checksummed PostgreSQL migrations to the private `trios` schema. Never expose this schema through Supabase's Data API.
4. Run `migrations/supabase-storage.sql` in that same project. The photo bucket must remain private; do not add public read policies.
5. Set the Supabase Auth site URL to the production origin and add the exact `/auth/callback` URL to the redirect allowlist. Configure a production email sender. Supabase's default SMTP is limited and is not appropriate for unrestricted customer launch.
6. Redeploy with the environment values, sign in through `/staff/sign-in`, and add crew using their verified sign-in email addresses. Every other verified account receives customer permissions only.

There are no embedded administrator passwords, demo accounts or hardcoded credentials. If auth is unconfigured, account pages show a connection notice; they never treat request headers as a signed-in user.

## Existing Sites records

The historical Cloudflare D1 migrations remain under `drizzle/` for reference. Vercel uses `migrations/postgres/`. The previous Sites publication remains a separate deployment; this repository does not automatically export its database or files.

Migrating existing customer history requires an owner-controlled data export and a verified mapping from the old Sites identity IDs to new Supabase user IDs. Do not assign history by the contact email typed into a quote form. Import files only to the private bucket and preserve upload ownership.

## Payments and notifications

The platform records invoices and manually verified e-transfer/cash payments; it does not charge cards. Customer updates appear in the portal. The optional AI key enables assisted planning; guided recommendations work without it. Adding a provider key does not itself connect card processing, SMS or transactional customer notifications.
