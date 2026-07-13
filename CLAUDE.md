# Project: White-Label Real Estate & Property Management ERP

## State of the project
ALL PHASES (0–7) UI ARE BUILT AND SHIPPING — the frontend now covers
every tested migration end to end.
Phase 7 (Procurement & Inventory) at /procurement: Requisitions
(multi-line draft → submit → SoD approve/reject via
rpc.approveRequisition which the server blocks for self-approval;
approved → 'Create purchase order' copies lines onto a draft PO),
Purchase orders (issue draft→issued; 'Receive goods' via
rpc.receiveGoods with partial receipts → partially_received/received,
over-receipt blocked, stock posts automatically via trigger),
Inventory (items with on-hand rollup from stock_levels, warehouses,
low-stock banner via rpc.lowStockItems, manual adjustment appends an
immutable stock_movement and the trigger updates the derived level;
negative stock blocked), Vendors (CRUD with categories + bank_details
jsonb). Requisition statuses draft/submitted/approved/rejected; PO
statuses draft/issued/partially_received/received/closed/cancelled;
movement types receipt/issue/transfer_in/transfer_out/adjustment.
New RPCs registered in the Functions allowlist: approve_requisition,
receive_goods, issue_stock_to_work_order, low_stock_items.
Phase 6 (Visitors & Parking)
Phase 6 (Visitors & Parking): /visitors — issue pass (registers
visitor + creates visitor_pass with auto QR token), gate check-in via
rpc.checkInPass(token) and check-out via rpc.checkOutPass(token) (the
DB function notifies the host), revoke pending passes, on-site count.
/parking — Spaces (zones + spaces), Allocations (allocate space to
tenant with monthly fee; ending sets active=false and the DB trigger
frees the space; one_active_allocation_per_space surfaced as friendly
error), Vehicles register, and 'Run parking billing' via
rpc.parkingBillingRun() (idempotent, invoices tenants through Finance).
Pass statuses pending/checked_in/checked_out/expired/revoked; space
types resident/visitor/reserved, statuses available/allocated/blocked.
IMPORTANT: new RPCs (check_in_pass, check_out_pass, parking_billing_run)
had to be registered in the Functions map in database.types.ts — the
typed allowlist rejects unregistered rpc names.
Next session: Phase 7 UI (procurement & inventory) — the LAST phase —
using docs/ROADMAP.md Phase 7 prompt, skipping its migration step.
Phase 5 (Facilities)
Phase 5 (Facilities) at /facilities: Assets (list + detail with
service history — history rows are written by the DB trigger when a
work order linked to the asset is verified; asset detail links to
those work orders), Operations (operational_schedules for cleaning/
security/waste/landscaping + 'Log completion' writing operational_logs),
Inspections (create optionally from an inspection_template which seeds
items; detail with 0–5 per-item scoring where the DB trigger recomputes
overall_score live; Complete & lock sets status 'completed' and items
lock). Asset statuses operational/faulty/under_repair/decommissioned/
disposed; inspection statuses draft/in_progress/completed.
Next session: Phase 6 UI (visitors, vehicles & parking) using
docs/ROADMAP.md Phase 6 prompt, skipping its migration step.
Phase 4 (Maintenance)
Phase 4 (Maintenance) at /maintenance: Requests (tenant-raised from
portal or staff-logged; acknowledge; convert-to-work-order marks
request 'converted' and creates a linked work_order status 'open'),
Work orders (list + detail: cost items labor/parts/other with
auto-rollup total_cost, contractor assignment, status progression
open→in_progress→on_hold→completed→cancelled, and VERIFY which flips
to 'verified' — the DB trigger posts the cost to Finance as an expense
and locks items; verify button requires maintenance.approve), and
Contractors (CRUD with trades chips + rating). Tenant portal gained a
'Report an issue' button creating a maintenance_request. Work order
statuses are open/in_progress/on_hold/completed/verified/cancelled
(NOT draft/assigned). maintenanceRequestSchema added to schemas.
Next session: Phase 5 UI (facilities & assets) using docs/ROADMAP.md
Phase 5 prompt, skipping its migration step.
Phase 3 (Finance)
Phase 3 (Finance) at /finance: Overview (outstanding rent, collected
this month, collection rate, arrears aging 0-30/31-60/61-90/90+, plus
'Run billing now' and 'Apply penalties now' buttons calling
rpc.billingRun / rpc.applyPenalties), Invoices (list + detail with
line items and void), Payments (record payment -> rpc.allocatePayment
oldest-first, shows outstanding balance), Expenses (manual + auto-
posted from verified work orders), Landlord statements (generate via
rpc.generateLandlordStatement, record disbursement -> status
disbursed), Penalty rules (percent or flat, property override).
Landlord-facing /my-statements is read-only (RLS-scoped). Tenant
portal gained a My-invoices/balance section. Finance uses real column
names: landlord_statements.gross_collected/expenses_total/net_due,
statement status draft|finalized|disbursed. NOTE: InvoiceLineRow,
PaymentAllocationRow, PenaltyRuleRow, ExpenseCategoryRow,
DisbursementRow live in database.types.ts and MUST each be registered
once in the Tables interface.
Next session: Phase 4 UI (maintenance & work orders) using
docs/ROADMAP.md Phase 4 prompt, skipping its migration step.
Phase 2:
Phase 2: Tenants (list + detail tabs: profile, leases, documents,
complaints, notices), Landlords (list + detail: profile with bank
details, ownership records driving statement math & portal
visibility), Leases (list with status chips, creation wizard that
lists only AVAILABLE units and pre-fills rent from the unit,
detail with activate/terminate/renew — activation flips the unit to
occupied via the DB trigger, termination/renew handled with rollback
on failure, deposits recorded as held), and the TENANT PORTAL at
/portal (my tenancy, notices with acknowledge, raise/track complaints,
my documents — all RLS-scoped to the signed-in tenant). Dashboard
redirects tenant-only accounts to /portal and shows an
expiring-leases (90d) widget. Storage bucket 'tenant-documents'
(PRIVATE). Nav now role-gates portal vs staff items.
Next session: Phase 3 UI (rent, billing & finance) using
docs/ROADMAP.md Phase 3 prompt, skipping its migration step.
Phase 1: /properties list
Phase 1: /properties list (filters, card/table views, create/edit),
property detail with tabs — Overview (unit status summary, cover
photo), Structure (buildings/floors + bulk unit generator via
rpc.generateUnits), Units (filterable table + edit drawer), Photos
(signed-URL gallery, cover selection), Documents (categorised uploads,
signed download), Managers (property_managers assignment — the RLS
scoping driver), Land parcels (land-type properties). Storage bucket
'property-media' (PRIVATE — app uses signed URLs).
Next session: Phase 2 UI (landlords, tenants, leases + portals) using
docs/ROADMAP.md Phase 2 prompt, skipping its migration step.
Phase 0: auth (login/forgot/reset),
app shell (sidebar, Ctrl+K palette, notifications, profile,
dark/light, mobile drawer), full Settings Center (organization,
branding+uploads, domain, AI branding, branches CRUD, users/roles/
invites, permission matrix, activity log), executive dashboard.
Next session: Phase 1 UI (properties & units) using docs/ROADMAP.md
Phase 1 prompt, skipping its migration step.

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
