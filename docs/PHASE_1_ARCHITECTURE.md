# Phase 1 architecture and implementation plan

## 1. Proposed architecture

KLGCR is a Next.js App Router application with strict TypeScript. React Server Components load protected data; Server Actions handle authentication and privileged user-management mutations. Supabase supplies Auth and PostgreSQL. Browser code receives only the project URL and anon key. The service-role key is read only by the server-side user administration action. Middleware refreshes sessions, while server page guards and PostgreSQL RLS independently enforce access.

The Vercel deployment is stateless. Later phases can add Google Sheet/Drive adapters and scheduled Vercel/Supabase jobs behind server-only interfaces without changing Phase 1 identity or navigation.

## 2. Folder structure

```text
src/app/                 routes, layouts and server actions
  (auth)/login/          public login
  (dashboard)/admin/     admin and future view-only surface
  (dashboard)/staff/     maintenance staff surface
src/components/          reusable responsive UI
src/lib/supabase/        browser/server Supabase factories
src/lib/                 authorization and shared types
supabase/migrations/     ordered PostgreSQL schema and RLS
docs/                    architecture decisions
public/                  KLG brand assets
```

## 3. Database schema and Supabase tables

Phase 1 deliberately creates only foundation tables:

- `profiles`: one-to-one extension of `auth.users`; username, display name, role, active/soft-delete state.
- `blocks`: controlled A–D master data.
- `profile_blocks`: many-to-many default block assignments.
- `app_settings`: JSON settings prepared for completion rules and movement thresholds.
- `user_access_audit`: immutable foundation for access-management events.

`auth.users` remains Supabase-owned. Foreign keys use restrictive deletion for profiles/audits so employee deletion cannot silently destroy history. A signup trigger creates a least-privileged maintenance profile. Phase 2 will add complaints, locations, jobs, work items, assignments, status history, appointments, monitoring, photos and notifications. Phase 3 adds the inventory transaction aggregate. Reports reference those authoritative records in Phase 4 rather than duplicating them early.

## 4. Roles and permissions

| Capability | Admin | Maintenance staff | Management viewer (future) |
|---|---:|---:|---:|
| Admin dashboard | Full | No | Read only |
| Staff dashboard | No | Own | No |
| Read all profiles/blocks | Yes | Own profile/blocks | Yes |
| Create/disable/reset/assign users | Yes | No | No |
| Change settings | Yes | No | No |

Route guards improve UX but are not the security boundary. RLS checks the active profile for every table. `is_admin`, `is_management`, and `current_role` are reusable database helpers for later migrations. New accounts default to maintenance staff regardless of client metadata. The service role is restricted to server actions that first call `requireRole(["admin"])`. User-access audit rows are written by those trusted server actions with the service role; authenticated clients have no audit-table write privileges, so they cannot forge or alter the ledger.

## 5. Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: publishable/anon key, safe for browser use with RLS.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only admin key; never prefix with `NEXT_PUBLIC_`.
- `NEXT_PUBLIC_APP_URL`: canonical origin used for password reset redirects.

## 6. Deployment plan

1. Create Supabase development and production projects.
2. Apply migrations with `supabase db push` and bootstrap the first admin as documented in README.
3. Configure each environment variable in Vercel; expose only URL and anon key publicly.
4. Connect the Git repository to Vercel and require lint, typecheck, unit test and production build checks.
5. Configure the Supabase Auth site URL and allowed redirect URL to the Vercel production domain.
6. Validate one admin and one maintenance account on desktop and mobile before promoting.

## 7. Technical questions / non-blockers

No question blocks Phase 1. The supplied logo file was not present in the repository, so the implementation uses a restrained KLG monogram placeholder. Replace `public/klg-mark.svg` with the approved company artwork before production. Before Phase 5, confirm Google Workspace service-account policy, Sheet column names, Drive sharing constraints and ownership. Before production, provide the final domain and decide whether username lookup enumeration should be replaced by an organisation-specific email alias convention.
