# KLGCR Maintenance & Inventory System

Phase 1 foundation for KLG Campus Residence: responsive role dashboards, Supabase authentication, RLS and basic user administration. See [the architecture plan](docs/PHASE_1_ARCHITECTURE.md) for scope and decisions.

## Local setup

1. Install Node.js 20+ and run `npm install`.
2. Copy `.env.example` to `.env.local` and enter Supabase credentials.
3. Install/link the Supabase CLI, then run `supabase db push` (or paste the migration into the SQL editor).
4. Start with `npm run dev`.

### Bootstrap the first administrator

Create the first Auth user in the Supabase dashboard with `username` and `full_name` metadata, then run this once in SQL Editor using the user's email:

```sql
update public.profiles set role = 'admin'
where email = 'admin@your-company.example';
```

Subsequent employees can be created in **Admin → Users**. Passwords require at least 10 characters. Disabling an employee updates the application profile and bans the Auth user; reset sends the Supabase recovery email.

## Quality checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Database migrations

Migrations are chronological under `supabase/migrations`. Never edit an applied production migration; add another migration. RLS is enabled for every public Phase 1 table. To test permissions, create separate admin and maintenance accounts rather than using the service role in a browser.

## Vercel deployment

Import this repository in Vercel, set all variables from `.env.example`, and deploy with the default Next.js preset. Set the Supabase Auth site URL to the production origin and allow `<origin>/login` for recovery redirects. Keep preview and production Supabase projects separate when possible.

## Google integration (Phase 5 preparation only)

No Google sync is implemented in Phase 1. Later, create a least-privilege Google Cloud service account, enable Sheets and Drive APIs, share only the source Sheet/Drive folder with it, and store credentials as server-only secrets. Confirm exact source columns and Drive access rules before Phase 5; never expose credentials or make tenant photos public.

## Current boundary

Phase 1 authentication, roles, user management, and responsive shells remain in place. Phase 2 adds complaint intake, review, assignment, live dashboard counts, and staff job start; inventory and reporting remain for later phases.

## Phase 2 migration

After the Phase 1 migration, run `supabase/migrations/202608260001_phase2_complaints_jobs.sql` once in the Supabase SQL Editor. It adds the complaint intake and assignment workflow without changing the Phase 1 tables or policies. Apply this migration before opening the Phase 2 routes.
