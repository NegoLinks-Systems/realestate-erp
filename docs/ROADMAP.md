# NegoLinks Real Estate ERP — Phased Roadmap & Build Prompts

**Product:** NegoLinks Real Estate & Property Management ERP
**Stack:** React 19 · TypeScript · Vite · Tailwind · shadcn/ui · React Query · React Hook Form · Zod · Supabase (Auth, Postgres, Storage, Edge Functions, RLS) · Vercel
**Target:** White-label, multi-property, multi-branch ERP deployable at any domain (initially realestate.negolinks.com)

---

## 1. How to Use This Document

This roadmap breaks the full specification into **13 sequential phases**. Each phase is a self-contained unit of work that ends with working, deployable software — no placeholders, no "coming soon" pages. Modules simply don't appear in the navigation until their phase ships.

**Recommended workflow (Claude Code):**

1. Create a repository and add a `CLAUDE.md` file at the root containing the **Global Context Block** below. Claude Code reads this automatically in every session, so you never have to re-explain the project.
2. Run the phases **in order** — later phases depend on tables, roles, and components created earlier.
3. Paste one **Build Prompt** per session. Let it finish, verify the Definition of Done checklist, commit, then move on.
4. After every phase: `npm run build` must pass, and the app must deploy cleanly to Vercel.

**Rules that apply to every phase** (already embedded in the Global Context Block):

- Nothing hardcoded: no company name, logo, domain, email, or AI assistant name in code. Everything reads from `organization_settings`.
- Every table gets RLS policies, `created_at`, `updated_at`, `deleted_at` (soft delete), and audit logging.
- Every mutation goes through Zod-validated forms and React Query mutations.
- Mobile-first, dark/light mode, consistent design system.

---

## 2. Global Context Block (put this in CLAUDE.md)

```markdown
# Project: White-Label Real Estate & Property Management ERP

## What this is
An enterprise, multi-tenant-style Real Estate ERP. First deployment is
"NegoLinks Real Estate ERP" at realestate.negolinks.com, but ALL branding
(org name, app name, logo, favicon, colors, domain, emails, letterhead,
AI assistant name) is stored in the `organization_settings` table and
loaded at runtime. NOTHING brand-specific is ever hardcoded.

## Stack
- Frontend: React 19 + TypeScript + Vite + Tailwind + shadcn/ui
- Data: React Query (server state), React Hook Form + Zod (forms)
- Backend: Supabase — Auth, Postgres with RLS, Storage, Edge Functions
- Deploy: Vercel (frontend), Supabase (backend). PWA enabled.

## Architecture rules
- Hierarchy: organization → branches → properties → buildings → floors → units
- Every domain table includes: id (uuid), organization_id, branch_id where
  relevant, created_at, updated_at, deleted_at (soft delete), created_by
- RLS on EVERY table. Access is scoped by organization, then by role and
  branch/property assignment
- Roles (enum `app_role`): super_admin, company_owner, regional_manager,
  branch_manager, property_manager, estate_manager, facility_manager,
  leasing_officer, sales_officer, accountant, procurement_officer,
  maintenance_officer, security_officer, receptionist, landlord, tenant,
  property_owner, contractor, vendor, auditor
- Permissions resolved via a `role_permissions` table (module + action),
  checked in a single `usePermissions()` hook and in RLS policies
- All money stored as numeric(14,2) with currency from org settings
- Audit: `audit_logs` table + `log_activity()` helper called on every
  financial and property mutation
- File uploads: Supabase Storage, bucket per module, signed URLs only

## Code conventions
- Feature folders: src/features/<module>/{components,hooks,api,schemas,pages}
- Shared UI in src/components/ui (shadcn) and src/components/shared
- One React Query key factory per feature (src/features/<module>/api/keys.ts)
- Zod schema is the single source of truth for each form; infer TS types
- Route guards by permission, not by role name
- No placeholder pages. A module either works or is not routed/visible.

## Definition of done (every phase)
- `npm run build` passes with zero TS errors
- All new tables have RLS + soft delete + audit triggers
- Works in dark and light mode, mobile and desktop
- Branding pulled from organization_settings everywhere
```

---

## 3. Phase Overview

| # | Phase | Depends on | Rough effort |
|---|-------|-----------|--------------|
| 0 | Foundation & White-Label Core | — | Large |
| 1 | Property Portfolio & Units | 0 | Large |
| 2 | Landlords, Tenants & Leases | 1 | Large |
| 3 | Rent, Billing & Finance | 2 | Large |
| 4 | Maintenance Management | 1 | Medium |
| 5 | Facility & Asset Management | 4 | Medium |
| 6 | Visitor, Vehicle & Parking | 1 | Medium |
| 7 | Procurement & Inventory | 0 | Medium |
| 8 | CRM & Sales Pipeline | 1 | Medium |
| 9 | Project Management (Development/Construction) | 7 | Medium |
| 10 | HR Management | 0 | Medium |
| 11 | Communication Center & Automated Reminders | 2, 3 | Medium |
| 12 | Reports, Analytics, AI Layer, PWA & Packaging | all | Large |

Phases 4–10 are largely independent of one another — after Phase 3 you can reorder them to match business priority (e.g., if your first client is a shopping mall, pull Visitor/Parking forward).

---

## 4. Phase Details & Build Prompts

---

### Phase 0 — Foundation & White-Label Core

**Objective:** A deployable shell with authentication, roles, the complete Organization Settings module (the white-label heart of the product), design system, and audit infrastructure.

**Key deliverables**
- Vite + React 19 + TS project with Tailwind, shadcn/ui, React Query, router, ESLint/Prettier
- Supabase project wiring: typed client, generated DB types, migration workflow
- Auth: email/password sign-in, password reset, session management, protected routes
- `app_role` enum, `user_roles`, `role_permissions` tables + `usePermissions()` hook
- **Organization Settings module**: org name, product name, app name, logo, favicon, address, phones, WhatsApp, emails, website, registration details, tax info, social links, currency, timezone, date format, language, theme colors, login screen branding, letterhead, digital stamp/signature uploads, email & document template settings
- **Domain & Deployment Settings**: primary domain, application URL, client portal URL, API base URL (stored, not hardcoded)
- **AI Branding Settings**: configurable assistant name/description (used later in Phase 12)
- Runtime branding: `BrandingProvider` that loads org settings, sets favicon, document title, CSS theme variables, login screen branding
- App shell: collapsible sidebar, top bar with global search placeholder wired to a real command palette (Ctrl+K) searching routes, notification center shell backed by a real `notifications` table, profile menu, dark/light toggle
- `audit_logs` table + logging helper; `branches` table + branch switcher
- Empty-state executive dashboard that renders real widgets fed by whatever data exists (no fake numbers)

**Core tables:** `organization_settings`, `branches`, `user_profiles`, `user_roles`, `role_permissions`, `audit_logs`, `notifications`

**Definition of done**
- Fresh Supabase project + `.env` → app boots, admin can log in, change org name/logo/colors, and see them applied instantly everywhere
- Changing theme colors updates Tailwind CSS variables live
- A second test user with a restricted role sees a correctly reduced sidebar
- Deployed to Vercel successfully

**Build Prompt (paste into Claude Code):**

```text
Read CLAUDE.md first. We are starting Phase 0 of the ERP: Foundation &
White-Label Core.

Scaffold the full project per the conventions in CLAUDE.md, then build:

1. Supabase setup: migrations folder, seed script, generated types script.
   Create tables: organization_settings (single row, all branding fields:
   org name, product name, app name, logo_url, favicon_url, address,
   phone_numbers jsonb, whatsapp_numbers jsonb, emails jsonb, website,
   registration_details jsonb, tax_info jsonb, social_links jsonb,
   currency, timezone, date_format, language, theme_colors jsonb,
   login_branding jsonb, letterhead_url, stamp_url, signature_url,
   domain_settings jsonb {primary_domain, app_url, portal_url, api_base_url},
   ai_branding jsonb {name, tagline, avatar_url}),
   branches, user_profiles, user_roles, role_permissions, audit_logs,
   notifications. RLS on all. Seed the full role list and a sensible
   default permission matrix.

2. Auth flow: login, forgot/reset password, session handling, route
   guards driven by role_permissions via a usePermissions() hook.

3. BrandingProvider: loads organization_settings on boot, applies theme
   colors as CSS variables, sets favicon + document title, exposes
   useBranding(). Login page renders configured login branding.

4. App shell: collapsible sidebar (permission-filtered), top bar,
   Ctrl+K command palette searching routes, notification center reading
   the notifications table, profile menu, dark/light mode with
   persistence, responsive mobile drawer.

5. Settings Center at /settings with sections: Organization, Branding &
   Theme, Domain & Deployment, Branches (full CRUD), Users & Roles
   (invite user, assign roles/branches, edit permission matrix),
   AI Branding. Every form: React Hook Form + Zod, file uploads to
   Supabase Storage with signed URLs.

6. Executive dashboard route with a widget grid that renders real
   queries (counts of branches, users, notifications for now) — widgets
   for later modules must NOT appear yet.

7. Audit logging helper log_activity(module, action, entity, diff) and
   wire it into all settings mutations. Activity log viewer at
   /settings/activity for admins.

Finish with: npm run build passing, a README section "Phase 0 setup"
covering Supabase config, env vars, and Vercel deploy. No placeholder
pages anywhere.
```

---

### Phase 1 — Property Portfolio & Unit Management

**Objective:** The physical-world backbone: properties of all types, buildings, floors, units, land parcels, availability.

**Key deliverables**
- Property CRUD: residential, commercial, mixed-use, mall, office building, estate, apartment block, house, warehouse, land
- Property profile page: photos gallery, documents, location details, assigned managers
- Structure builder: buildings → floors → units (apartments, shops, offices, villas, parking spaces)
- Unit lifecycle status: available, reserved, occupied, under maintenance, unlisted
- Availability calendar per unit; bulk unit generator (e.g., "create 40 units across 10 floors")
- Land management: parcels, titles, survey documents
- Portfolio dashboard: totals, occupancy %, vacancy list — these numbers now light up on the executive dashboard

**Core tables:** `properties`, `buildings`, `floors`, `units`, `land_parcels`, `property_documents`, `property_photos`, `property_managers`

**Definition of done**
- Create an estate with 2 buildings, 4 floors, 24 units in under 3 minutes using the bulk generator
- Executive dashboard shows real Total Properties, Vacant Units, Occupancy Rate
- A property manager role sees only their assigned properties (RLS-verified)

**Build Prompt:**

```text
Read CLAUDE.md. Phase 1: Property Portfolio & Unit Management. Phases
completed so far: 0 (foundation, org settings, roles, audit, shell).

Build the full property module:

1. Migrations: properties (type enum covering residential, commercial,
   mixed_use, mall, office_building, estate, apartment_block, house,
   warehouse, land; address, geo coords, branch_id, status, year_built,
   description), buildings, floors, units (unit_type enum: apartment,
   shop, office, villa, parking_space, warehouse_unit; bedrooms, size,
   base_rent, service_charge, status enum: available, reserved,
   occupied, maintenance, unlisted), land_parcels (title info, survey
   docs), property_photos, property_documents, property_managers
   (user↔property assignment). RLS: org-scoped; property_manager and
   below scoped to assigned properties; landlord/tenant roles get no
   access yet.

2. Pages: /properties list (filterable by type, branch, status; card and
   table views), /properties/:id profile with tabs (Overview, Structure,
   Units, Photos, Documents, Managers), unit detail drawer with
   availability calendar.

3. Structure builder UI: add buildings/floors inline; bulk unit
   generator (pattern-based naming like A-101…A-110 per floor).

4. Photo gallery + document uploads to Supabase Storage with previews.

5. Wire executive dashboard widgets: Total Properties, Total Units,
   Vacant Units, Occupancy Rate (occupied/total, excluding unlisted).

6. Audit-log all mutations. npm run build must pass.
```

---

### Phase 2 — Landlords, Tenants & Leases

**Objective:** People and contracts: landlord/owner records, tenant profiles, and the full lease lifecycle.

**Key deliverables**
- Landlord/property-owner management: profiles, ownership records linking owners to properties/units with ownership %, bank details for disbursement
- Tenant management: profiles (individual & corporate), KYC documents, occupancy records, communication history, complaints/notices log
- Lease lifecycle: draft → active → expiring → renewed/terminated; digital agreement storage; security deposits; rent review schedule; expiry alerts (in-app for now, automated messaging arrives in Phase 11)
- Tenant portal view (tenant role): my lease, my documents, my complaints
- Landlord portal view: my properties, my units, my statements (statement math lands in Phase 3)

**Core tables:** `landlords`, `ownership_records`, `tenants`, `tenant_documents`, `leases`, `lease_documents`, `security_deposits`, `rent_reviews`, `complaints`, `notices`

**Definition of done**
- Full flow: create tenant → attach lease to a vacant unit → unit flips to occupied → lease shows on tenant portal
- Terminating a lease frees the unit and archives the lease with audit trail
- Expiring-soon leases surface on dashboard and property pages

**Build Prompt:**

```text
Read CLAUDE.md. Phase 2: Landlords, Tenants & Leases. Completed: 0–1.

1. Migrations: landlords (individual/corporate, contact, bank_details
   jsonb), ownership_records (landlord↔property/unit, ownership_percent,
   start/end), tenants (individual/corporate, KYC fields), 
   tenant_documents, leases (unit_id, tenant_id, start/end dates, rent
   amount + frequency enum monthly/quarterly/biannual/annual, deposit,
   status enum draft/active/expiring/expired/terminated/renewed,
   agreement_url), security_deposits (held/refunded/forfeited ledger),
   rent_reviews, complaints (status workflow), notices. RLS: tenants see
   only their own rows; landlords see only owned properties/units.

2. Business rules as Postgres functions + app logic: activating a lease
   sets unit status to occupied and blocks double-active leases per
   unit; terminating frees the unit; nightly check (Supabase scheduled
   edge function) flips active→expiring within 90 days and
   expiring→expired past end date, writing notifications.

3. Pages: /landlords, /landlords/:id (ownership, units, documents),
   /tenants, /tenants/:id (profile, leases, documents, complaints,
   notices, communication log), /leases with pipeline-style status
   filters, lease creation wizard (unit picker shows only available
   units), lease detail with renewal action (creates linked new lease).

4. Portals: tenant role lands on /portal with My Lease, My Documents,
   My Complaints (create + track). Landlord role: My Properties,
   My Units with occupancy status.

5. Dashboard: Expiring Leases (90 days) widget, Active Leases count.
   Audit everything. Build must pass.
```

---

### Phase 3 — Rent, Billing & Finance

**Objective:** The money engine: invoicing, rent collection, service charges, utilities, penalties/discounts, landlord disbursements, and financial reporting.

**Key deliverables**
- Recurring invoice generation from active leases (rent + service charge + utilities), driven by a scheduled edge function
- Payment recording: manual entry now, with a `payment_providers` abstraction so gateways (Paystack/Flutterwave/etc.) can plug in later without schema changes
- Penalties (late fees, configurable rules) and discounts/waivers with approval trail
- Utility billing: metered (readings) and fixed
- Landlord revenue distribution: statements per landlord per period, management fee %, disbursement records
- Finance dashboards: rental income, outstanding rent, collection rate, service charge collection, P&L, cash flow
- Receipts and invoices as branded PDFs using org letterhead/stamp from settings

**Core tables:** `invoices`, `invoice_lines`, `payments`, `payment_allocations`, `penalty_rules`, `discounts`, `utility_meters`, `meter_readings`, `landlord_statements`, `disbursements`, `expense_categories`, `expenses`

**Definition of done**
- Activating a lease auto-generates its invoice schedule; the nightly job issues due invoices
- Recording a payment allocates against oldest invoices and updates outstanding balances everywhere (tenant portal included)
- Landlord statement for a month computes: rent collected − management fee − property expenses = net due, exportable as branded PDF
- Executive dashboard money widgets are now real

**Build Prompt:**

```text
Read CLAUDE.md. Phase 3: Rent, Billing & Finance. Completed: 0–2.

1. Migrations: invoices (tenant, lease, due_date, status enum
   draft/issued/partially_paid/paid/overdue/void), invoice_lines (type
   enum rent/service_charge/utility/penalty/other), payments (method
   enum cash/bank_transfer/pos/cheque/online, reference, received_by),
   payment_allocations (payment↔invoice), penalty_rules (grace days,
   percent or flat, per org/property), discounts (with approved_by),
   utility_meters + meter_readings, expenses + expense_categories,
   landlord_statements, disbursements. A payment_providers table +
   TypeScript provider interface stub so real gateways slot in later
   WITHOUT schema change (do not integrate a gateway now).

2. Scheduled edge function 'billing-run': generates invoices from
   active leases per their frequency, applies penalty rules to overdue
   invoices, flips statuses, writes notifications.

3. Pages: /finance dashboard (income this month, outstanding, collection
   rate %, aging buckets 0-30/31-60/61-90/90+), /finance/invoices (bulk
   issue, void with reason), /finance/payments (record payment with
   auto-allocation oldest-first, manual override), /finance/expenses,
   /finance/utilities (meters + reading entry with consumption calc),
   /finance/landlord-statements (generate per landlord per period:
   collected rent − management_fee_percent − expenses = net; record
   disbursement against statement).

4. Branded PDF generation (client-side, e.g. pdf-lib or react-pdf) for
   invoices, receipts, landlord statements — letterhead, logo, stamp,
   currency, date format all from organization_settings.

5. Tenant portal: My Invoices + My Payments with balances. Landlord
   portal: My Statements. Executive dashboard: Rental Income,
   Outstanding Rent, Service Charge Collection now live.

6. Accountant role gets finance module permissions; auditor role gets
   read-only everywhere. Audit-log every financial mutation with
   before/after values. Build passes.
```

---

### Phase 4 — Maintenance Management

**Objective:** Requests, work orders, preventive schedules, contractor assignment, and cost tracking.

**Key deliverables**
- Tenant-raised and staff-raised maintenance requests with photos, priority, category
- Work orders: assignment to internal staff or contractors, status workflow, parts/labor costs, completion evidence
- Preventive maintenance: recurring schedules per asset/property (monthly generator service, quarterly pest control…) auto-creating work orders
- Contractor records with trade categories and job history
- Maintenance cost roll-ups feeding property expenses (Phase 3 tables)

**Core tables:** `maintenance_requests`, `work_orders`, `work_order_items`, `maintenance_schedules`, `contractors`

**Definition of done**
- Tenant submits request from portal with photo → property manager converts to work order → assigns contractor → contractor role sees it in their portal → completion with cost writes an expense record
- Preventive schedule generates next work order automatically (scheduled function)
- Dashboard shows Open Maintenance Requests for real

**Build Prompt:**

```text
Read CLAUDE.md. Phase 4: Maintenance Management. Completed: 0–3.

1. Migrations: maintenance_requests (raised_by tenant or staff, unit or
   common area, category enum plumbing/electrical/hvac/structural/
   cleaning/security/other, priority, photos, status enum
   new/acknowledged/converted/rejected), work_orders (request_id
   nullable, assigned_to user or contractor, scheduled date, status enum
   open/in_progress/on_hold/completed/verified/cancelled, completion
   photos, verified_by), work_order_items (labor/parts, qty, cost),
   maintenance_schedules (property/asset, recurrence rule, next_run),
   contractors (company, trades jsonb, contact, rating). RLS: tenants
   see own requests; contractors see only assigned work orders.

2. Flows: tenant portal 'Report an Issue' with photo upload; manager
   triage board (kanban by status); convert request→work order; work
   order completion writes an expense row (category: maintenance) via
   the Phase 3 expenses table; verification step by manager.

3. Scheduled function extends billing-run pattern: materialize work
   orders from maintenance_schedules when next_run arrives, advance
   next_run per recurrence.

4. Contractor portal: assigned work orders, accept/start/complete with
   photos and cost entry (subject to manager verification).

5. Pages: /maintenance (kanban + table), /maintenance/schedules,
   /contractors, /contractors/:id (history, total spend). Dashboard:
   Maintenance Requests widget live. Audit + build passes.
```

---

### Phase 5 — Facility & Asset Management

**Objective:** Assets, equipment, utilities oversight, cleaning/security/waste operations, and building inspections.

**Key deliverables**
- Asset register: equipment per property (generators, lifts, pumps, HVAC) with serials, warranties, depreciation-ready fields, service history (links to Phase 4 schedules)
- Operational logs: cleaning rosters, security shift logs, waste collection schedules
- Building inspections: templated checklists, scored inspections with photos, generated inspection reports (branded PDF)

**Core tables:** `assets`, `asset_service_history`, `operational_schedules`, `operational_logs`, `inspection_templates`, `inspections`, `inspection_items`

**Definition of done**
- Asset links to its preventive schedule and shows full service history
- Inspection completed on mobile with photos → branded PDF report generated
- Facility manager role has exactly this module scope

**Build Prompt:**

```text
Read CLAUDE.md. Phase 5: Facility & Asset Management. Completed: 0–4.

1. Migrations: assets (property_id, category enum generator/lift/pump/
   hvac/electrical/plumbing/fire_safety/other, serial, purchase info,
   warranty_expiry, status), asset_service_history (links work_orders),
   operational_schedules (type enum cleaning/security/waste/landscaping,
   recurrence, assigned team/vendor), operational_logs (schedule_id,
   performed_at, performed_by, notes, photos), inspection_templates
   (jsonb checklist items with categories and scoring),
   inspections (template, property, inspector, overall_score, status),
   inspection_items (item, score, comment, photos).

2. Pages: /facilities/assets (+detail with service timeline pulling
   related work orders), /facilities/operations (schedules + log entry,
   mobile-optimized), /facilities/inspections (template builder, run
   inspection wizard — checklist stepper with per-item photo + score),
   inspection report as branded PDF.

3. Link assets to maintenance_schedules (Phase 4) so 'create preventive
   schedule' is available from asset detail.

4. Facility manager and security officer roles scoped correctly.
   Dashboard: Assets count + upcoming inspections. Audit + build passes.
```

---

### Phase 6 — Visitor, Vehicle & Parking Management

**Objective:** Estate/mall gate operations: visitor passes with QR, check-in/out, vehicles, and parking allocation with fees.

**Key deliverables**
- Visitor pre-registration by residents/tenants and walk-in registration by security
- QR pass generation, scan-to-check-in/out (camera scan on mobile PWA), host notifications
- Vehicle registry per tenant/resident; visitor vehicles
- Parking: zones/spaces per property, resident allocation, visitor parking, parking fees (invoiced via Phase 3 tables)
- Visitor and parking reports

**Core tables:** `visitors`, `visitor_passes`, `visit_logs`, `vehicles`, `parking_zones`, `parking_spaces`, `parking_allocations`, `parking_fees`

**Definition of done**
- Tenant pre-registers visitor → visitor gets QR (shareable link) → security scans at gate → host gets in-app notification → check-out logged
- Parking space allocation generates a recurring fee line on the tenant's invoice
- Security officer role limited to gate operations

**Build Prompt:**

```text
Read CLAUDE.md. Phase 6: Visitor, Vehicle & Parking. Completed: 0–5.

1. Migrations: visitors (name, phone, photo optional), visitor_passes
   (host user, property, valid window, QR token uuid, status enum
   pending/active/checked_in/checked_out/expired/revoked), visit_logs
   (check_in/out timestamps, gate, security officer), vehicles
   (owner tenant/staff, plate, model, color, sticker_no), parking_zones,
   parking_spaces (zone, number, type resident/visitor/reserved,
   status), parking_allocations (space↔tenant/vehicle, recurring fee),
   parking_fees (rates per property for visitor parking).

2. QR flow: pass detail renders QR of a signed token; public
   pass page (tokenized URL, no auth) shows pass validity for the
   visitor's phone; security scan screen (PWA camera via a lightweight
   QR lib) validates token, performs check-in/out, writes visit_logs,
   sends host notification.

3. Parking: zone/space designer per property, drag-simple grid or table;
   allocating a space to a tenant creates a recurring invoice line via
   Phase 3 billing (invoice_lines type: other, label Parking).

4. Pages: /security/gate (scan + walk-in registration, big touch
   targets), /visitors (logs + reports: daily counts, peak hours),
   /parking (zones, spaces, allocations). Tenant portal: My Visitors
   (pre-register + pass sharing), My Vehicles.

5. RLS: security officer sees gate ops for assigned property only.
   Audit + build passes.
```

---

### Phase 7 — Procurement & Inventory

**Objective:** Vendors, purchase orders with approvals, inventory/consumables, and warehouse tracking.

**Key deliverables**
- Vendor registry with categories and documents
- Purchase requisition → approval → purchase order → goods receipt flow
- Inventory: items, stock levels per warehouse/store, consumables issue (e.g., to work orders), low-stock alerts
- Costs flow into expenses (Phase 3) and work orders (Phase 4)

**Core tables:** `vendors`, `purchase_requisitions`, `purchase_orders`, `po_lines`, `goods_receipts`, `inventory_items`, `warehouses`, `stock_levels`, `stock_movements`

**Definition of done**
- Full flow: requisition → approval (permission-gated) → PO (branded PDF to vendor) → goods receipt updates stock
- Issuing consumables to a work order adds cost lines to it
- Low-stock threshold triggers notification

**Build Prompt:**

```text
Read CLAUDE.md. Phase 7: Procurement & Inventory. Completed: 0–6.

1. Migrations: vendors (categories jsonb, bank details, documents),
   purchase_requisitions (requested_by, property, lines jsonb or child
   table, status enum draft/submitted/approved/rejected),
   purchase_orders (vendor, requisition_id nullable, status enum
   draft/issued/partially_received/received/closed/cancelled), po_lines,
   goods_receipts (+lines), warehouses (per property or central),
   inventory_items (sku, unit, reorder_level), stock_levels
   (item↔warehouse), stock_movements (receipt/issue/transfer/adjustment,
   reference to work_order or PO).

2. Flows: requisition approval gated by role_permissions
   (procurement.approve); PO PDF branded from org settings; goods
   receipt increments stock and can post an expense; 'Issue to Work
   Order' picker on work order detail adds parts cost from stock.

3. Pages: /procurement/vendors, /procurement/requisitions,
   /procurement/orders, /inventory (stock by warehouse, movement
   history, adjustments with reason), low-stock notification via the
   nightly scheduled function.

4. Procurement officer role scope. Audit + build passes.
```

---

### Phase 8 — CRM & Sales Pipeline

**Objective:** Prospective buyers/tenants, sales pipeline for property sales, marketing campaigns, and follow-ups.

**Key deliverables**
- Leads (prospective tenants and buyers) with source tracking
- Pipeline board: inquiry → viewing → negotiation → offer → closed won/lost, for both rentals and sales
- Property viewings scheduler; conversion: won rental lead → tenant + lease (Phase 2), won sale → sale record + ownership transfer
- Campaigns: simple campaign records with lead attribution and follow-up task queue

**Core tables:** `leads`, `lead_activities`, `pipelines`, `pipeline_stages`, `deals`, `viewings`, `campaigns`, `follow_ups`, `property_sales`

**Definition of done**
- Lead → viewing → deal won → one-click "Convert to Tenant" pre-fills Phase 2 tenant + lease wizard
- Sales officer sees conversion rates per source and per campaign
- Overdue follow-ups surface as notifications

**Build Prompt:**

```text
Read CLAUDE.md. Phase 8: CRM & Sales Pipeline. Completed: 0–7.

1. Migrations: leads (type enum rental/purchase, contact, source enum
   website/referral/walk_in/social/campaign/other, interested units/
   properties, budget), lead_activities (call/email/visit/note),
   pipelines + pipeline_stages (seed defaults for Rentals and Sales),
   deals (lead, unit/property, stage, expected value, status
   open/won/lost with reason), viewings (schedule, outcome), campaigns
   (name, channel, budget, period), follow_ups (due_at, assigned_to,
   status), property_sales (buyer, price, payment plan summary,
   documents, completed_at).

2. UI: kanban pipeline with drag between stages, lead detail timeline,
   viewing scheduler (conflicts checked), campaign detail with lead
   attribution and simple ROI (deals won value vs budget).

3. Conversions: won rental deal → launches tenant+lease wizard
   prefilled; won sale → creates property_sales record and (optional
   toggle) transfers/creates ownership_record (Phase 2 table) for the
   buyer as landlord.

4. Nightly function: overdue follow_ups → notifications to assignees.

5. Pages: /crm/pipeline, /crm/leads, /crm/viewings, /crm/campaigns.
   Sales officer + leasing officer scopes. Audit + build passes.
```

---

### Phase 9 — Project Management (Development & Construction)

**Objective:** Construction/development projects with milestones, budgets, contractors, and progress tracking.

**Key deliverables**
- Projects linked to properties (new development or renovation)
- Milestones with target dates and completion evidence; Gantt-style timeline view
- Budgets vs actuals (actuals pulled from POs/expenses tagged to the project)
- Contractor assignments per milestone; progress photo log
- Project dashboard: % complete, budget burn, overdue milestones

**Core tables:** `projects`, `project_milestones`, `project_budget_lines`, `project_contractors`, `project_updates`

**Definition of done**
- Expenses and POs can be tagged to a project and roll into budget-vs-actual automatically
- Milestone completion requires evidence upload and updates % complete
- Executive dashboard "Active Projects" is live

**Build Prompt:**

```text
Read CLAUDE.md. Phase 9: Project Management. Completed: 0–8.

1. Migrations: projects (property_id nullable for greenfield, type enum
   development/renovation/infrastructure, status enum
   planning/active/on_hold/completed/cancelled, start/end, budget_total),
   project_milestones (title, weight percent, target_date, completed_at,
   evidence photos), project_budget_lines (category, budgeted amount),
   project_contractors (contractor_id, scope, contract value),
   project_updates (progress notes + photos). Add nullable project_id
   to expenses and purchase_orders (Phases 3/7) via migration.

2. Budget vs actual: actuals = sum of expenses + received PO values
   tagged with project_id, grouped to budget line categories.

3. UI: /projects list, project detail with tabs (Overview: % complete
   from milestone weights, budget burn bar, overdue flags; Milestones:
   timeline/Gantt-lite view; Budget; Contractors; Updates feed with
   photos). Milestone completion requires at least one evidence photo.

4. Dashboard: Active Projects widget live. Audit + build passes.
```

---

### Phase 10 — HR Management

**Objective:** Employees, attendance, leave, payroll-ready structure, performance reviews.

**Key deliverables**
- Employee records (links to user accounts where staff have logins), departments, designations, branch assignment
- Attendance: daily check-in/out (web/PWA), attendance reports
- Leave: types, balances, request → approval workflow
- Payroll-ready: salary structure fields, allowances/deductions definitions, exportable payroll sheet (no payment processing)
- Performance: review cycles with simple scored templates

**Core tables:** `employees`, `departments`, `designations`, `attendance_records`, `leave_types`, `leave_balances`, `leave_requests`, `salary_structures`, `performance_cycles`, `performance_reviews`

**Definition of done**
- Staff can check in/out and request leave from mobile; managers approve
- Monthly payroll sheet exports to XLSX with salary structure math
- HR data invisible to non-HR roles (RLS-verified)

**Build Prompt:**

```text
Read CLAUDE.md. Phase 10: HR Management. Completed: 0–9.

1. Migrations: departments, designations, employees (user_id nullable,
   employment type, hire date, branch, department, designation, status),
   attendance_records (date, check_in/out, method, geo optional),
   leave_types (days per year), leave_balances (per employee per year),
   leave_requests (approval workflow), salary_structures (base,
   allowances jsonb, deductions jsonb, effective_from),
   performance_cycles + performance_reviews (template jsonb, scores).

2. Flows: self check-in/out widget on staff dashboard (one active
   session per day); leave request → manager approval decrements
   balance; payroll sheet generator: pick month → XLSX export (use
   sheetjs) with base + allowances − deductions per employee.

3. Pages: /hr/employees, /hr/attendance (daily register + monthly
   summary), /hr/leave (requests + balances), /hr/payroll (structure
   editor + monthly export), /hr/performance. Strict RLS: employees see
   self; managers see their branch; HR/owner see all.

4. Audit + build passes.
```

---

### Phase 11 — Communication Center & Automated Reminders

**Objective:** Outbound messaging (email, SMS, WhatsApp) with pluggable providers configured in settings, template management, and the automated reminder engine.

**Key deliverables**
- Provider abstraction with adapters: Email (SMTP incl. Gmail/Microsoft 365, EmailJS), SMS (Termii, Africa's Talking, Twilio, SmartSMSSolutions), WhatsApp (Meta Cloud API) — credentials entered in Settings, stored encrypted, sent via edge functions (never from the browser)
- Template manager: merge-field templates for rent due, lease expiry, maintenance updates, inspections, meetings, outstanding payments — all using org branding
- Reminder engine: rules (e.g., rent due T-7/T-1/T+3, lease expiry T-90/T-30) executed by the nightly function, respecting per-tenant channel preferences
- Message log: every outbound message recorded with status; manual compose to individuals or filtered groups (all tenants of property X)

**Core tables:** `messaging_providers`, `message_templates`, `reminder_rules`, `messages`, `message_recipients`, `communication_preferences`

**Definition of done**
- Admin configures an SMTP provider in Settings → test send works
- Rent-due reminder rule fires from the nightly run and logs delivery per recipient
- Every message renders org name/branding from settings, never hardcoded

**Build Prompt:**

```text
Read CLAUDE.md. Phase 11: Communication Center. Completed: 0–10.

1. Migrations: messaging_providers (channel enum email/sms/whatsapp,
   provider key, config jsonb — store secrets via Supabase Vault or
   encrypted column, is_default per channel), message_templates (key,
   channel, subject, body with {{merge_fields}}, is_system),
   reminder_rules (event enum rent_due/lease_expiry/maintenance_update/
   inspection/meeting/outstanding_payment, offsets jsonb like
   [-7,-1,3], channels, active), messages (channel, template, status
   enum queued/sent/failed, error), message_recipients,
   communication_preferences (per tenant: allowed channels).

2. Edge functions: send-message (adapter pattern: smtp via a mail API-
   compatible relay or provider REST APIs; termii, africastalking,
   twilio, smartsms, meta whatsapp cloud — implement each adapter
   against their documented REST API with graceful failure + retry
   once), and extend the nightly job: evaluate reminder_rules against
   invoices/leases/work orders and enqueue messages.

3. Settings: /settings/communications — provider CRUD with 'send test',
   default per channel; template editor with merge-field picker and
   live preview using org branding; reminder rules editor.

4. Pages: /communications (message log with filters + resend failed),
   compose to individual or audience filter (property/status-based).
   Seed system templates for all six reminder events.

5. Never expose secrets to the client. Audit + build passes.
```

---

### Phase 12 — Reports, Analytics, AI Layer, PWA & Packaging

**Objective:** The finishing layer: full report suite, executive analytics, the configurable AI assistant integrated across the ERP, PWA/offline behavior, and the deployment package.

**Key deliverables**

*Reports & Analytics*
- Report center: occupancy, rent roll, arrears/aging, property performance, financial (P&L, cash flow), maintenance, contractor, tenant reports — each filterable, exportable to PDF (branded) and XLSX
- Executive dashboard final pass: configurable widget layout persisted per user; AI Business Insights widget

*AI Layer* (assistant name/branding from AI Branding settings — never expose provider)
- Natural-language Q&A over live data via an edge function that translates questions to safe, permission-scoped queries
- Drafting: lease agreements, renewal notices, maintenance reports, contractor communications, legal correspondence templates, inspection reports — output to PDF/DOCX
- Forecasting & recommendations: rental income forecast, vacancy prediction, pricing recommendations, occupancy analysis (start with transparent statistical baselines — trend + seasonality — surfaced through the AI panel; label confidence)
- AI panel available app-wide (side drawer), context-aware per module

*PWA & Hardening*
- PWA manifest + service worker: offline shell, cached reference data, queued mutations replay on reconnect (scoped to safe modules: inspections, gate logs, meter readings, attendance)
- Rate limiting on edge functions, input-validation sweep, RLS test suite, Lighthouse pass

*Packaging*
- ZIP archive of the repo + `SETUP_GUIDE.md`: beginner-friendly steps for Supabase config, env vars, Vercel deploy, DNS for realestate.negolinks.com, and rebranding checklist for future clients

**Definition of done**
- Every report exports branded PDF + XLSX
- Ask the assistant "What's my occupancy in Branch A and which leases expire next month?" → correct, permission-scoped answer
- App installs as PWA; an inspection completed offline syncs on reconnect
- A non-developer can follow SETUP_GUIDE.md to a working deployment

**Build Prompt:**

```text
Read CLAUDE.md. Phase 12 (final): Reports, AI, PWA, Packaging.
Completed: 0–11.

1. Report Center /reports: occupancy, rent roll, arrears aging,
   property performance, P&L, cash flow, maintenance, contractor,
   tenant reports. Shared ReportShell: filters (branch, property, date
   range), table + chart, export to branded PDF and XLSX. Persist
   user-configurable executive dashboard layout (drag widgets,
   saved per user).

2. AI assistant (name/avatar from ai_branding settings, provider never
   exposed): global side-panel. Edge function 'assistant' that:
   a) answers NL questions by selecting from a whitelisted set of
      parameterized queries (occupancy, arrears, expiring leases,
      income, vacancies, maintenance load) scoped by the caller's
      permissions — never raw SQL from model output;
   b) drafts documents (lease agreement, renewal notice, maintenance
      report, contractor letter, legal correspondence template,
      inspection report) using org branding + live record data, with
      export to PDF and DOCX (use docx lib);
   c) insights: rental income forecast and vacancy risk via seasonal
      trend baselines computed in SQL, presented with confidence
      labels; pricing recommendation comparing unit rent to portfolio
      comparables. Surface top 3 insights on the dashboard widget.
   Configure the LLM provider via env vars server-side only.

3. PWA: manifest (icons from org favicon/logo), service worker with
   offline shell + cached lookups, background-sync queue for
   inspections, gate check-ins, meter readings, attendance; conflict
   policy last-write-wins with audit note.

4. Hardening: rate limits on all edge functions, Zod validation sweep,
   RLS test script (attempt cross-org and cross-role access, must
   fail), remove any console noise, Lighthouse ≥90 performance/PWA.

5. Packaging: SETUP_GUIDE.md — plain-language steps: create Supabase
   project, run migrations + seed, set env vars, deploy to Vercel,
   point DNS (realestate.negolinks.com example), first-login super
   admin setup, and a 'Rebrand for a new client' checklist. Then
   produce the release ZIP. Final npm run build must pass.
```

---

## 5. Cross-Phase Practices

- **Migrations only.** Never edit the database by hand; every change is a numbered migration so a new client deployment is reproducible.
- **Seed data ≠ fake data.** Seeds cover roles, permissions, default templates, and enums — never demo tenants or fabricated numbers.
- **RLS tests after every phase.** One script that logs in as each role and asserts what it can/can't see. Run it before every commit.
- **One design system.** New modules must reuse `ReportShell`, table, form, drawer, and status-badge components from earlier phases. If a phase needs a new shared component, it goes in `components/shared`, not the feature folder.
- **Branding audit per phase.** Grep for the literal strings "NegoLinks", "negolinks.com", and any email address before committing. Zero matches allowed outside seeds/docs.
- **Commit per phase, tag per phase** (`v0.1-phase0` …) so you can always roll back to the last working milestone.

## 6. Suggested Order Adjustments by Client Type

- **Residential estate first client:** 0 → 1 → 2 → 3 → 6 (gate/visitors) → 4 → 11 → 12, defer 7–10.
- **Shopping mall first client:** 0 → 1 → 2 → 3 → 4 → 5 → 6 → 11 → 12.
- **Developer/off-plan sales first client:** 0 → 1 → 8 (CRM) → 9 (projects) → 2 → 3 → 12.

The dependency rule is simple: 0→1→2→3 is the spine; everything else hangs off it.
