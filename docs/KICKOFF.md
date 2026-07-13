# Claude Code Kickoff — White-Label Real Estate ERP

This document is the handoff. It tells Claude Code (or any developer)
how to assemble three prepared artifact packages into a working repo,
which patterns are law, and exactly what to build first.

---

## 1. What you're holding

| Artifact | File | Status |
|---|---|---|
| Phased roadmap + per-phase build prompts | `NegoLinks_ERP_Roadmap_and_Build_Prompts.md` | Plan of record |
| Database core, Phases 0–7 | `erp_migrations_phases_0-7.zip` | **Built & tested** — 18 migrations, regression suite, README of conventions |
| TypeScript contract layer | `erp_contract_layer.zip` | **Built & tested** — typed client, permissions hook, branding provider, RPC wrappers, Zod schemas |

The database work for roadmap Phases 0 through 7 is DONE and validated
against PostgreSQL 16 (state machines, money math, stock ledger, RLS
isolation for every portal role). What remains is:

- **All UI** (Phases 0–7 screens on the existing schema)
- **Edge functions** (nightly job, messaging, AI assistant)
- **Migrations for Phases 8–11** (CRM, projects, HR, communications —
  plain CRUD following the established patterns)
- **Phase 12** (reports, AI layer, PWA, packaging)

## 2. Assemble the repo

```bash
npm create vite@latest erp -- --template react-ts && cd erp
npx supabase init

# Drop in the artifacts:
#   erp_migrations zip → supabase/migrations/*.sql  (all 18 files)
#                        test/                       (verify.sql + stub)
#   erp_contract zip   → src/lib, src/hooks, src/providers,
#                        src/api, src/schemas, src/vite-env.d.ts
#   this file          → docs/KICKOFF.md
#   roadmap            → docs/ROADMAP.md
#   CLAUDE.md below    → ./CLAUDE.md

npm i @supabase/supabase-js @tanstack/react-query zod react-hook-form \
      @hookform/resolvers react-router-dom
npx supabase start && npx supabase db reset   # applies all 18 migrations
```

Sanity check before writing any code: run `test/verify.sql` against the
local database (apply `test/00000_supabase_stub.sql` only on plain
Postgres — real Supabase already has the auth schema). Every check
should pass; the handful of ERRORs it prints are intended rejections
and are labeled as such.

## 3. CLAUDE.md (paste at repo root — supersedes the roadmap's version)

```markdown
# Project: White-Label Real Estate & Property Management ERP

## State of the project
Migrations 00001–00018 EXIST, are applied, and are TESTED. They cover
org settings, roles/permissions, audit, notifications, properties/
units, landlords/tenants/leases, full billing & finance, maintenance,
facilities, visitors/parking, procurement/inventory. Do NOT recreate
or restructure these tables. New tables continue the numbering from
00019. The contract layer in src/{lib,hooks,providers,api,schemas}
exists and typechecks; build on it, never around it.

## Stack
React 19 + TS + Vite + Tailwind + shadcn/ui, React Query,
React Hook Form + Zod, Supabase (Auth/Postgres/RLS/Storage/Edge
Functions), Vercel. PWA in Phase 12.

## Non-negotiables
1. WHITE-LABEL: nothing brand-specific in code. Every name, logo,
   color, domain, currency, date format, AI-assistant name comes from
   useBranding() / organization_settings. Before any commit:
   `grep -ri "negolinks" src supabase` must return only docs/seeds.
2. PERMISSIONS: UI gates with usePermissions().can(module, action)
   using the vocabulary in src/lib/modules.ts. RLS is the enforcement;
   the hook only hides controls.
3. SCOPING: property visibility is user_property_ids() /
   can_access_property() in the database — ONE function, extended by
   CREATE OR REPLACE when a phase adds a new audience. Never inline
   scoping logic in a policy.
4. MONEY/STATE LOGIC lives in database functions (like billing_run,
   allocate_payment, receive_goods), called through src/lib/rpc.ts.
   The frontend never computes balances or transitions statuses.
5. Every financial/property mutation calls rpc.logActivity() on
   success.
6. Every form validates with a schema in src/schemas mirroring the
   DB CHECK constraints. Query keys only from src/api/keys.ts.
7. No placeholder pages. Unbuilt modules are not routed or shown.

## Database patterns (from the tested migrations — follow exactly)
- Every table: uuid id, created_at/updated_at (+ set_updated_at
  trigger), deleted_at soft delete, created_by. RLS enabled, no table
  left open. No hard-delete policies on business tables.
- Live-state uniqueness via PARTIAL unique indexes (one live lease per
  unit, one active allocation per space). If a function upserts against
  a partial unique index, ON CONFLICT must repeat the index predicate:
  `on conflict (col) where col is not null do nothing`.
- Recurring/generated charges are idempotent via
  invoice_lines.source_ref (e.g. 'parking:<alloc>:<YYYY-MM>',
  penalty rule id). Re-running any *_run() function creates nothing.
- Ledgers (stock_movements, audit_logs, visit_logs,
  asset_service_history) are append-only: no client write policies
  and/or an immutability trigger; corrections are new rows.
- Triggers: mutate NEW in BEFORE; side effects (posting an expense,
  writing history) in AFTER.
- SECURITY DEFINER functions that read tables must be created AFTER
  those tables (SQL-language bodies are validated at creation).
- In RLS EXISTS subqueries, ALWAYS qualify the outer table's columns
  (`where le.unit_id = units.id`, never `= id`) — unqualified names
  bind to the inner table and silently match nothing.
- PORTAL-ROLE GUARD: when vendor/landlord/tenant/contractor holds a
  module 'view' permission for its own-rows policy, every STAFF read
  branch on that module must add `and not has_role('<role>')` (plus
  `or public.is_admin()`), or the permission becomes an all-rows pass.

## Billing conventions
rent_amount is per period of rent_frequency; invoices fall due at
period start (rent in advance); overdue = past due_date and unpaid.
Statuses transition only via refresh_invoice_status().

## Frontend gotcha
The Database schema in src/lib/database.types.ts must use `type`
aliases, not `interface` — interfaces lack implicit index signatures
and silently collapse the supabase client's types to `never`.

## The nightly job (one scheduled edge function, in this order)
lease_status_refresh(90) → billing_run() → parking_billing_run() →
apply_penalties() → materialize_maintenance_schedules() →
expire_visitor_passes() → notify assignees for low_stock_items()
and overdue follow-ups. All are idempotent; safe to re-run.

## Definition of done, every session
npm run build clean; test/verify.sql passes; new tables follow the
patterns above with RLS; works in dark/light + mobile; branding grep
clean; commit + tag.
```

## 4. Bug ledger — found in testing, do not reintroduce

1. **Helper-before-table**: `language sql` functions referencing
   not-yet-created tables fail the migration. Order: tables → helpers
   → policies.
2. **RLS correlation bug**: `where le.unit_id = id` bound `id` to the
   lease, not the unit — tenant portal would have shown no unit, with
   zero errors. Qualify outer columns in every EXISTS policy.
3. **ON CONFLICT vs partial index**: `on conflict (work_order_id)`
   couldn't infer the partial unique index; the predicate must be
   repeated in the conflict clause.
4. **Vendor leak**: vendor role's `procurement.view` satisfied the
   staff read branch → every vendor saw every PO. Fixed with the
   portal-role guard; audit each new module for it.
5. **supabase-js `never` collapse**: interfaces in the Database type.
   Use type aliases.
6. Two of the finance test "failures" were wrong *expectations*, not
   wrong code (overdue counts, penalty counts). When a verify check
   fails, first re-derive the expected value by hand before touching
   the code.

## 5. Session 1 prompt (paste into Claude Code)

```text
Read CLAUDE.md, docs/KICKOFF.md, and the migration README in
supabase/. Migrations 00001–00018 are applied and tested; the
contract layer in src/ typechecks. Your job this session is the
Phase 0 UI on top of them — no schema changes.

Build:
1. Auth flow (login, forgot/reset, session) with route guards driven
   by usePermissions(); wire supabase auth state into a small
   useAuth() hook.
2. App shell: BrandingProvider at the root; collapsible sidebar
   filtered by can(module,'view'); top bar with Ctrl+K command
   palette over routes; notification center reading the
   notifications table (mark-read on click); profile menu; dark/light
   with persistence; mobile drawer.
3. Settings Center (/settings): Organization (all
   organization_settings fields incl. uploads to Storage for logo/
   favicon/letterhead/stamp/signature), Branding & Theme (live CSS
   var preview), Domain & Deployment, AI Branding, Branches CRUD,
   Users & Roles (invite via supabase admin API in an edge function,
   assign roles/branches, permission-matrix editor that refuses to
   edit super_admin), Activity log viewer over audit_logs.
4. Executive dashboard calling rpc.portfolioStats() plus counts that
   exist today (branches, users, unread notifications). Widgets for
   unshipped modules must not render.
5. Wire rpc.logActivity() into every settings mutation.

Finish: npm run build clean, branding grep clean, README section
"Local setup" updated. Then stop and summarize what exists.
```

## 6. Sessions 2+ — running the remaining phases

Use the per-phase build prompts in docs/ROADMAP.md **with one standing
amendment**: for Phases 1–7, the migrations already exist — skip each
prompt's migration step and build only the UI/flows against the live
schema and src/lib/rpc.ts. For Phases 8–11, write new migrations from
00019 following the patterns in CLAUDE.md (and extend
user_property_ids() only if a genuinely new audience appears), then
append checks to test/verify.sql in the same style before building UI.
Phase 12 (reports, AI assistant behind ai_branding, PWA, packaging)
runs last, unchanged from the roadmap.

## 7. Per-session close-out checklist

- [ ] `npm run build` clean
- [ ] `test/verify.sql` passes end-to-end on a fresh `db reset`
- [ ] New policies audited for the portal-role guard
- [ ] `grep -ri "negolinks" src supabase` → docs/seeds only
- [ ] Dark/light + mobile pass on new screens
- [ ] Commit, tag `vX.Y-phaseN`
