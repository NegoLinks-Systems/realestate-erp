# NegoLinks Enterprise Upgrade — Roadmap & Status

This app was first built as a standalone, fully white-label Real Estate & Property
Management ERP. It is now being **upgraded in place** to align with the current
NegoLinks Enterprise Standards (branding, layout, AI platform, and the wider
enterprise feature set). This is an **upgrade, not a rewrite** — every existing
module, workflow, migration and business rule is preserved; we only restyle and
extend.

Work proceeds in **phases, each one built and `npm run build`-verified before it
ships**, exactly as the original build did. This file tracks what's done and what's
planned so the plan travels with the code.

---

## How the two branding models reconcile

The original spec required *zero hardcoded branding*. The NegoLinks brand standard
requires a *fixed* NegoLinks identity on the pre-login shell. These are not in
conflict — they apply to different layers:

- **Before login** (login screen, splash, footer): fixed NegoLinks identity — the
  gold infinity-loop logo, the "NegoLinks" gold wordmark, the product subtitle, and
  the product accent color (**Real Estate = Estate Silver `#94A3B8`**). Mandated by
  the brand standard (Part 1–4).
- **After login**: the customer's organization branding takes over — their logo,
  name, colors and currency from `organization_settings`, applied at runtime by
  `BrandingProvider`. This is the white-label layer the app already had, and it is
  exactly Part 6 of the brand standard.

So the business modules remain brand-neutral; only the pre-login chrome carries fixed
NegoLinks branding.

---

## Feasibility note (honest scope)

This app is a browser SPA talking directly to Supabase — there is no server/API tier.
That shapes what each upgrade item means here:

- **Deliverable as real, compiling frontend now:** design system & branding, layout,
  richer dashboards, expanded settings, feature flags, universal search over permitted
  modules, in-app notifications, mobile polish, CSV/XLSX export. Security (RBAC, RLS,
  audit, Zod validation) is already substantially present.
- **Requires backend infrastructure / external credentials** (delivered as real
  scaffolding with clearly-marked integration points, **not** mocks passed off as
  finished): the multi-provider AI platform with server-side provider secrecy, API
  versioning to `/api/v1/`, background-job engine, backup/DR, and the multi-channel
  Communication Center (Twilio / WhatsApp / Termii / etc.). These need Supabase Edge
  Functions and provider accounts to become production-grade.

Nothing here is marked "done" unless it actually compiles and works against the
existing Supabase backend.

---

## Phases

### ✅ Phase 1 — Enterprise Design System & Branding (DONE)
- Fixed dark base palette (`#080810 / #0E0E1C / #131325 / #1C1C34`) and Estate Silver
  accent tokens in `src/index.css`, bridged to the app's existing `--brand-primary`
  so all 38 files using `bg-brand`/`text-brand` inherit the accent with no edits.
- Fonts switched to **Inter / Poppins / JetBrains Mono**; app defaults to dark base.
- **Gold NegoLinks logo** (inline SVG, `src/components/brand/NegoLinks.tsx`) — drop in
  the official PNG later without markup changes.
- **Enterprise login**: split hero panel (real-estate motif) + glassmorphic card with
  the gold wordmark, product subtitle, and accent sign-in — existing auth logic intact.
- **Splash screen** wired into the auth-boot loading state.
- **Footer** "Powered by NegoLinks Enterprise Suite" in the app shell.
- Verified: `npm run build` clean, `tsc` clean.

### ✅ Phase 2 — Enterprise Layout & Shared Component Library (DONE)
- Retuned all shared primitives (Card, Field/Input, Dialog, Drawer, Button, Bits) to
  the exact NegoLinks surfaces — card `#131325`, surface `#0E0E1C`, border `#1C1C34` —
  so every page that uses them inherits the enterprise dark look.
- Sidebar: NegoLinks surface with the **Estate Silver accent** active state (gold is
  reserved for the logo per the branding Golden Rule; the component skill's gold active
  state is overridden by the branding skill it defers to).
- Navbar: NegoLinks surface with backdrop blur and accent focus affordances.
- Applied a safe mechanical surface pass across all pages (zinc dark tokens → NegoLinks
  hexes) for consistency without touching logic.
- Added shared `<PageHeader>` (§12) and `<DemoModeBanner>` (§16, wired into the shell,
  inert until Phase 4 toggles the `demo_mode` flag); `<EmptyState>` gained optional icon
  support (§18).
- Verified: `npm run build` clean, `tsc` clean.
- Deferred by design to their own phases (kept scope honest): `<KPICard>`, `<ChartCard>`,
  `<DataTable>` → Phase 3; `<AIPanel>` / `<AIInsightsPanel>` → Phase 5;
  `<ApprovalWorkflow>` → Phase 6; `<ReportViewer>` → Phase 7.

### ✅ Phase 3 — Dashboards & Analytics (DONE)
- Added shared `<KPICard>` (§5, accent-gradient value that follows org color),
  `<ChartCard>` (§13), a recharts chart theme, and `<SmartInsights>` (§8).
- Rebuilt the executive dashboard: KPI row (properties, occupancy, collected MTD,
  outstanding rent), a **collections trend** area chart (last 6 months from real
  payments), an **occupancy** donut, an **arrears aging** bar (90+ in red), and a
  **maintenance throughput** bar — every series computed from live Supabase data,
  permission-gated (portfolio / finance / maintenance), with honest empty states.
- **Smart Insights** are derived deterministically from the live figures (collection
  rate, 90-day arrears, occupancy, expiring leases) and are clearly documented in code
  as data-derived, NOT language-model output — the AI narrative arrives in Phase 5.
- Installed `recharts`; `npm run build` + `tsc` clean.
- Honest note: recharts pushes the JS bundle to ~354 KB gzip. Route-level
  code-splitting/lazy-loading is the **Phase 7** performance item and will bring the
  initial bundle back down.

### ✅ Phase 4 — Feature Flags & Demo Data Manager (DONE)
- **Migration 00019** (additive, tested from scratch against PostgreSQL 16): adds
  `feature_flags jsonb` + `demo_mode boolean` to organization_settings, `is_demo` to
  the core operational tables, `set_demo_mode()`, and the tested
  `load_demo_data(scenario)` / `delete_demo_data()` functions.
- **Feature Flags** (Super Admin, /settings/features): toggle any module or feature on/off,
  persisted to `feature_flags`; `useFeatureFlags` hook + the sidebar hides disabled
  modules. Defaults preserve existing behaviour (a flag is "on" unless explicitly false).
- **Demo Data Manager** (Super Admin, /settings/demo): scenario library (Small / Medium /
  Large / Multi-Branch / Heavy), Load / Reload / Delete with confirmation dialogs carrying
  the master-standard warnings, and **DEMO MODE** activation (the shell banner from Phase 2
  lights up). The generator produces coherent, interconnected data — branches → properties
  → units → tenants → **active leases that occupy units** → invoices → payments →
  work orders — so the dashboards populate (verified: medium = 70% occupancy, ~87%
  collection over 5 months). Delete removes only `is_demo` rows; real data is untouched
  (verified).
- Verified: all 19 migrations apply from scratch; demo load/reload/delete tested on live
  Postgres; `npm run build` + `tsc` clean.
- Settings expansion note: the organization_settings table already carries the enterprise
  fields (timezone, date format, language, tax_info, registration_details, contact, etc.);
  the existing Organization tab surfaces the core set. Surfacing the remaining jsonb
  sub-fields (tax ID, RC number, business hours) is a small follow-up.

### ✅ Phase 5 — AI Platform (DONE; live calls need a provider key)
- **Migration 00020** (tested from scratch on PG16): `ai_providers` (11 seeded, Groq
  default, config-only — no key column), `ai_prompt_templates` (4 built-ins with revert),
  `ai_usage_logs`, `org_ai_memory`, and `ai_config` on org settings; all with RLS.
- **Edge Function `supabase/functions/ai-chat`** — a real server-side proxy: verifies the
  caller's JWT, enforces the 200/hour rate limit, checks the module toggle, resolves the
  active provider, reads its key **from a Supabase secret** (never the DB/browser), builds
  the system prompt from the template + org memory, calls the provider (OpenAI-compatible
  plus Anthropic/Gemini paths), logs usage, and returns **only** assistant text — never the
  provider/model identity or raw provider errors.
- **Executive Assistant** slide-in panel (navbar, gated on the `ai_assistant` flag):
  chat, suggested prompts, copy, "Powered by NegoLinks Intelligence Engine"; shows a
  friendly "not configured" message until a key is set.
- **Settings → AI Platform** (Super Admin): provider/model/params, module AI controls,
  prompt-template editing with revert, and a usage & audit dashboard (KPIs + by-module
  chart from `ai_usage_logs`, honest empty state).
- Verified: 20 migrations apply from scratch; `npm run build` + `tsc` clean.
- **Honest integration point:** AI is fully wired but returns responses only once an
  admin sets the provider key (`supabase secrets set GROQ_API_KEY=…`) and deploys the
  function. No fake AI responses. Streaming is written as config but the proxy currently
  returns complete responses (with a typing indicator); token-by-token streaming is a
  documented enhancement. Org-AI-memory has its table + is used by the proxy; its
  management UI is a small follow-up.

### ✅ Phase 6 — Universal Search & Notification Channels (DONE)
- **Universal Search** (`UniversalSearch`, replaces the page-only palette): searches real
  data across permitted modules — properties, tenants, landlords, invoices, units, work
  orders — plus pages, debounced and grouped, each result deep-linking. Every source is
  gated by the viewer's module permission (RLS governs row access). Includes an **AI
  natural-language hand-off**: "Ask the assistant" routes the query into the Executive
  Assistant (gated on the `ai_assistant` flag).
- **Notification channels groundwork** — **Migration 00021** (tested from scratch on PG16):
  `notification_config` on org settings (which channels are enabled org-wide),
  per-user `notification_preferences` (channel opt-ins + email digest) with RLS, and a
  tested `effective_notification_channels(user)` function (org-enabled AND user-opted-in).
  A Notification Preferences settings page lets admins enable org channels and every user
  choose their own. In-app notifications work today.
- Verified: 21 migrations apply from scratch; `effective_notification_channels` tested;
  `npm run build` + `tsc` clean.

**Scope note (honest):** the actual *sending* on email / SMS / WhatsApp / push is coupled
to real provider credentials and Edge Functions, so it is delivered together with the
Communication Center in Phase 7 — the preferences and routing logic built here are what
that dispatcher consumes. The **configurable workflow engine** is the other large
remaining subsystem and is moved into Phase 7 (platform completion) rather than shipped
here as an untested stub.

### ◑ Phase 7 — Platform Completion (in progress)

> **Incident (resolved):** a silent render loop in `UniversalSearch` (unstable
> `perms` object in effect deps + fresh-array setState) starved React Router's
> transition-based navigation in production — URL changed, view didn't. Found by
> bisecting the real production bundle in headless Chromium; fixed with stable
> deps + bail-out updates + conditional mounting; guarded by `e2e/nav.e2e.mjs`.

**Done and verified this phase:**
- **Performance — code-splitting/lazy-loading.** Vendor chunking (recharts, react,
  supabase) + lazy-loaded the recharts-heavy pages. The main JS chunk dropped from
  **364 KB → 172 KB gzip**; recharts (114 KB gzip) now loads only on the dashboard/AI
  pages; SheetJS (143 KB gzip) loads only when a user exports to Excel — neither is in
  the initial bundle. `npm run build` + `tsc` clean.
- **Reports export — CSV & Excel.** Reusable `exportCSV` / `exportXLSX` (SheetJS loaded
  on demand) + an `<ExportMenu>` wired into the Tenants, Properties and Invoices lists.
  The component is reusable and can be dropped into any other list the same way.

**Genuinely remaining (needs dedicated build time and/or external credentials — not
shippable as tested work in a single pass, and not faked):**
- **PDF / DOCX report export** with the org letterhead — the deeper document-engine work
  (CSV/XLSX cover the tabular formats today).
- **Communication Center** — the multi-channel dispatcher (SMTP / Gmail / M365 / WhatsApp
  / Twilio / Termii / etc.) that consumes Phase 6's channel preferences. Requires provider
  credentials + Edge Functions to actually send; real scaffolding otherwise.
- **Configurable workflow engine** — workflow definitions + a generic approval runtime to
  replace today's hard-coded approvals. A substantial subsystem in its own right.
- **Ops groundwork** — background jobs, backup/DR, a system-health dashboard, and API
  versioning. These are largely infrastructure/ops rather than frontend features given the
  SPA + Supabase architecture (no server tier), so they'll be honest scaffolding with
  clear integration points rather than production-grade implementations.

These remaining items were deliberately **not** stubbed in to look complete — each is
either credential-dependent or large enough to warrant its own tested build.

---

## Working method (unchanged from the original build)
Read the relevant skill first → upgrade in place, preserving all logic → keep the
business modules brand-neutral → gate every action with `usePermissions().can(...)`
(RLS is the real enforcement) → `npm run build` must pass → ship one superseding ZIP
with an updated status here.
