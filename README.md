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
- Searchable service discovery, a multi-service shortlist, seasonal comparison and an editable annual care plan carried into booking.
- Customer visit-change requests with review history, withdrawal, administrator approval and atomic scheduling/cancellation updates.
- Approved access instructions delivered directly to the assigned crew; service concerns remain traceable to the relevant visit.
- Dispatch filters, workload and recurring-visit previews, crew next-visit cards and actionable business priorities.
- Evidence-based intake, dispatch, billing, equipment and customer-preparation assistants. They analyze supplied business records and prepare suggestions; they do not send messages, charge customers or change jobs autonomously.
- Connection-aware booking fallback, owner-only launch checks, private-photo bucket verification, search-engine sitemap and branded social previews.

## Local development

Use Node.js 22.13 or newer. Run `npm ci`, copy `.env.example` to `.env.local`, fill the dedicated project's values, then run `npm run dev`.

`npm run build` creates the native Next.js production build for Vercel. `npm run typecheck` and `npm test` validate types, access controls, workflows, session transitions and PostgreSQL constraints.

`npm run verify` runs the complete gate. GitHub Actions repeats it on pushes to main and pull requests. These automated checks are independent of any Vercel Git integration.

The September 2026 upgrade passes `npm audit --omit=dev` with no reported production dependency vulnerabilities. The retained Sites development toolchain still has six reported findings in vinext/image-size and Drizzle's legacy esbuild chain. These tools are not used by the native Vercel production build; review or retire that legacy path before using it again. The release does not force a prerelease framework migration or a Drizzle downgrade.

Service changes are introduced in `migrations/postgres/002_service_changes.sql`. Apply this migration before enabling the upgraded account workspaces. It adds `jobs.access_notes`, private service-change records and a database-enforced upload quota. The existing checked-in PostgreSQL migration runner applies it with the original migration in one transaction; historical applied migration files remain unchanged.

## Vercel activation

The existing Vercel project is `triosservices`, published at `https://triosservices.vercel.app`. Connect `Emmanuelok/triosservices` in that project's Git settings to enable deployments from GitHub; publishing source through the deployment API does not establish the Git integration. Keep the Next.js framework preset and the repository root. The repository includes `vercel.json`; no Cloudflare build is required.

Before opening online accounts to customers:

1. Create/select a **dedicated Trios Supabase project**. Do not reuse an unrelated application's database or auth tenant without an explicit decision.
2. Add the environment variables in `.env.example` to Vercel. `DATABASE_URL` is the project's pooled PostgreSQL connection; `SUPABASE_SERVICE_ROLE_KEY` must stay server-only. Set `OWNER_EMAILS` to the exact verified administrator email addresses. Set `SITE_ORIGIN` to the production origin.
3. Run `npm run db:migrate` with that database URL. It applies transactional, checksummed PostgreSQL migrations to the private `trios` schema. Never expose this schema through Supabase's Data API.
4. Run `migrations/supabase-storage.sql` in that same project. The photo bucket must remain private; do not add public read policies.
5. Set the Supabase Auth site URL to the production origin and add the exact `/auth/callback` URL to the redirect allowlist. Configure a production email sender. Supabase's default SMTP is limited and is not appropriate for unrestricted customer launch.
6. Redeploy with the environment values, sign in through `/staff/sign-in`, and add crew using their verified sign-in email addresses. Every other verified account receives customer permissions only.

There are no embedded administrator passwords, demo accounts or hardcoded credentials. If auth is unconfigured, account pages show a connection notice; they never treat request headers as a signed-in user.

The public `/api/health` endpoint exposes availability booleans only. It disables online booking until the auth, database schema, owner allowlist and production origin are configured. `/api/launch` is owner-only and distinguishes configuration from tested connections. A ready configuration is not a substitute for testing a real sign-in email, completed booking and private photo upload. The live Vercel frontend can be published while these connections are pending; phone and email contact remain available.

The 2026–27 winter season is November 15, 2026 through April 15, 2027. All suggested scope, date preferences and reference estimates remain subject to the written quote and route capacity.

## Existing Sites records

The historical Cloudflare D1 migrations remain under `drizzle/` for reference. Vercel uses `migrations/postgres/`. The previous Sites publication remains a separate deployment; this repository does not automatically export its database or files.

Migrating existing customer history requires an owner-controlled data export and a verified mapping from the old Sites identity IDs to new Supabase user IDs. Do not assign history by the contact email typed into a quote form. Import files only to the private bucket and preserve upload ownership.

## Payments and notifications

The platform records invoices and manually verified e-transfer/cash payments; it does not charge cards. Customer updates appear in the portal. The optional AI key enables assisted planning; guided recommendations work without it. Adding a provider key does not itself connect card processing, SMS or transactional customer notifications.
