# Setup & Deployment Guide

This is the complete, start-to-finish guide to deploying this Real Estate &
Property Management ERP. No prior experience with Supabase or Vercel is assumed.
Follow the parts in order. Allow about 60–90 minutes the first time.

The application is **fully white-label**: every brand name, logo, colour, currency
symbol, domain and AI-assistant name is read from a database row at runtime, not
hard-coded. You configure all of it from the in-app Settings area after deploying —
see Part 8. To run a second, differently-branded copy for another client, you repeat
Parts 1–7 against a fresh Supabase project; you never touch the code.

---

## What you are deploying

- **Database + backend logic** — 18 SQL migrations that create every table, all
  row-level-security (RLS) policies, ~20 roles with a 745-row permission matrix, and
  the server-side functions that do the real work (billing, payment allocation,
  penalty accrual, landlord statements, work-order costing, stock movements, etc.).
- **Frontend** — a React + TypeScript single-page app covering all 18 modules:
  Settings, Properties, Tenants, Landlords, Leases, the Tenant Portal, Finance,
  Maintenance, Facilities, Visitors, Parking, and Procurement & Inventory.
- **One edge function** — `invite-user`, used by the Users & Roles screen to invite
  staff by email.

---

## Part 0 — Tools you need

Install these once on your computer:

1. **Node.js 20 or newer** — https://nodejs.org (pick the LTS installer).
   Verify in a terminal: `node --version` should print v20 or higher.
2. **The Supabase CLI** — https://supabase.com/docs/guides/cli. On macOS with
   Homebrew: `brew install supabase/tap/supabase`. Verify: `supabase --version`.
3. **Git** — https://git-scm.com (probably already installed).

You will also create free accounts at **supabase.com** and **vercel.com**.

---

## Part 1 — Create the Supabase project

1. Sign in at https://supabase.com and click **New project**.
2. Give it a name (e.g. `acme-erp-prod`), choose a strong database password
   (**save it** — you will need it in Part 3), and pick the region closest to your
   users. Click **Create new project** and wait ~2 minutes for it to provision.
3. When it is ready, open **Project Settings → API** and copy two values:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - **anon public** key (a long string under "Project API keys")

   Keep this tab open; you need both in Part 5.

---

## Part 2 — Get the code and install dependencies

1. Unzip this package somewhere sensible and open a terminal in the project folder
   (the folder that contains `package.json`).
2. Install dependencies:

   ```bash
   npm install
   ```

---

## Part 3 — Link the project and push the database

The migrations in `supabase/migrations/` build the entire schema in the correct
order. You push them with the CLI.

1. Log the CLI into your Supabase account (opens a browser to authorise):

   ```bash
   supabase login
   ```

2. Link this repo to your project. Find your **project ref** — it is the
   `abcdefgh` part of your Project URL, also shown in Project Settings → General.

   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   ```

   When prompted, enter the database password you set in Part 1.

3. Push every migration:

   ```bash
   supabase db push
   ```

   You should see all 18 migrations apply with no errors. If you re-run it later, it
   only applies migrations that have not run yet.

**Verify:** in the Supabase dashboard open **Table Editor**. You should see dozens of
tables (organization_settings, properties, units, leases, invoices, work_orders,
inspections, visitor_passes, purchase_orders, stock_movements, and many more).

---

## Part 4 — Create the storage buckets

The app stores uploads in three buckets. Create them in **Storage → Create bucket**:

| Bucket name         | Public? | Used for                                            |
|---------------------|---------|-----------------------------------------------------|
| `branding`          | **Public**  | Organisation logo and favicon (must be public)  |
| `property-media`    | Private | Property and unit photos                            |
| `tenant-documents`  | Private | Lease PDFs and tenant documents                     |

Create each with exactly these names (lower-case, hyphenated). Toggle **Public** on
only for `branding`; leave the other two private. RLS policies already created in
Part 3 govern who can read the private buckets.

---

## Part 5 — Configure the frontend environment

1. In the project folder, copy the example env file:

   ```bash
   cp .env.example .env
   ```

2. Open `.env` and paste in the two values from Part 1:

   ```
   VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-public-key
   ```

3. Run it locally to confirm everything connects:

   ```bash
   npm run dev
   ```

   Open the printed URL (usually http://localhost:5173). You should see the login
   screen. You cannot log in yet — that is Part 6.

---

## Part 6 — Create the first administrator

New Supabase projects have no users. Create the first one by hand, then make them an
admin so they can invite everyone else from inside the app.

1. In the Supabase dashboard: **Authentication → Users → Add user → Create new user**.
   Enter an email and password and, for this first user, tick **Auto Confirm User**
   so you can log in immediately. Copy the new user's **UUID**.

2. Open **SQL Editor**, paste the following, replace the UUID, and run it. This grants
   the `super_admin` role and creates the single organisation-settings row the app
   reads its branding from:

   ```sql
   -- give the first user the top role
   insert into public.user_roles (user_id, role)
   values ('PASTE-THE-USER-UUID-HERE', 'super_admin');

   -- create the singleton settings row if it does not exist yet
   insert into public.organization_settings (id, organization_name, currency_code)
   values (1, 'Your Company Name', 'NGN')
   on conflict (id) do nothing;
   ```

   (You can change the name and currency later in Settings; this is just a starting
   point. The settings table is a singleton — only one row, `id = 1`, ever exists.)

3. Back at the login screen (local or deployed), log in with that email and password.
   You now have full access.

---

## Part 7 — Deploy to Vercel

1. Push this project to a Git repository (GitHub, GitLab, or Bitbucket).
2. Sign in at https://vercel.com, click **Add New → Project**, and import that repo.
3. Vercel auto-detects Vite. Confirm:
   - **Build command:** `npm run build`
   - **Output directory:** `dist`
   The included `vercel.json` already rewrites all routes to `index.html` so deep
   links and page refreshes work.
4. Under **Environment Variables**, add the same two variables from Part 5:
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
5. Click **Deploy**. After a minute you get a live `*.vercel.app` URL. Open it and log
   in with the admin account from Part 6.

### Deploy the invite edge function

The Users & Roles screen invites staff via the `invite-user` edge function. Deploy it
once:

```bash
supabase functions deploy invite-user
```

---

## Part 8 — Configure branding and invite your team

Everything from here is done inside the running app, signed in as the admin.

1. Open **Settings**. Work through the sections:
   - **Organization** — company name and currency (drives every money value shown).
   - **Branding** — upload a logo and favicon and set your brand colour. These apply
     across the app and the browser tab immediately.
   - **Domain** — your custom domain (cosmetic label; the actual DNS is Part 9).
   - **AI assistant** — the name shown for the in-app assistant.
   - **Branches** — add your offices/branches if you use them.
2. Open **Users & Roles** and invite your staff by email, assigning each a role. Each
   role only sees the modules and actions its permissions allow — this is enforced by
   RLS in the database, not just hidden in the UI.

---

## Part 9 — (Optional) Custom domain

To serve the app at, say, `erp.yourcompany.com`:

1. In Vercel: **Project → Settings → Domains → Add**, enter your domain, and Vercel
   shows you the DNS record to create.
2. At your DNS provider add a **CNAME** record for the subdomain (e.g. `erp`) pointing
   to `cname.vercel-dns.com`.
3. If your DNS is behind Cloudflare: add the CNAME with the proxy **off** (grey cloud)
   first so the certificate can be issued; you may re-enable the proxy afterwards. If
   you use Cloudflare's SSL setting, choose **Full (strict)** — never **Flexible**, as
   Flexible causes redirect loops.
4. Wait for the certificate to issue (usually minutes). The app is now on your domain.

---

## Part 10 — (Recommended) Schedule the nightly jobs

Several backend functions are designed to run every night. They are all **idempotent**
— running one twice in the same period does no harm and never double-charges — so
scheduling them is safe. You can always trigger the important ones by hand from the UI
(Finance has "Run billing now" and "Apply penalties now"; Parking has "Run parking
billing"), but scheduling means you don't have to.

Enable **pg_cron** and add the schedule in the **SQL Editor**:

```sql
-- enable the scheduler (one time)
create extension if not exists pg_cron;

-- 02:00 daily: generate due invoices from active leases
select cron.schedule('nightly-billing', '0 2 * * *', $$ select public.billing_run(); $$);

-- 02:10 daily: apply late-payment penalties to overdue invoices
select cron.schedule('nightly-penalties', '10 2 * * *', $$ select public.apply_penalties(); $$);

-- 02:20 daily: refresh invoice paid/overdue statuses
select cron.schedule('nightly-invoice-status', '20 2 * * *', $$ select public.refresh_invoice_status(); $$);

-- 02:30 daily: expire visitor passes past their validity window
select cron.schedule('nightly-expire-passes', '30 2 * * *', $$ select public.expire_visitor_passes(); $$);

-- 02:40 daily: materialise upcoming maintenance schedule occurrences
select cron.schedule('nightly-maint-schedules', '40 2 * * *', $$ select public.materialize_maintenance_schedules(); $$);

-- 03:00 on the 1st of each month: bill active parking allocations
select cron.schedule('monthly-parking-billing', '0 3 1 * *', $$ select public.parking_billing_run(); $$);
```

To see scheduled jobs later: `select * from cron.job;`
To remove one: `select cron.unschedule('nightly-billing');`

---

## How the modules connect (a quick tour)

The value of the system is that the modules feed each other through database triggers,
so numbers stay consistent without anyone re-keying them:

- **Leases → Finance.** Activating a lease marks its unit occupied and makes it
  billable; the nightly billing run raises rent invoices from active leases.
- **Payments.** Recording a tenant payment allocates it to their **oldest unpaid
  invoices first**, automatically.
- **Maintenance → Finance & Facilities.** When a manager *verifies* a completed work
  order, a trigger posts its cost to Finance as an expense **and**, if the work order
  was tied to an asset, writes a service-history entry on that asset.
- **Parking → Finance.** The monthly parking run invoices tenants for their space
  allocations, into the same Finance ledger.
- **Procurement → Inventory.** Receiving goods against a purchase order posts stock
  through an append-only movement ledger (negative stock is impossible); issuing stock
  to a work order decrements it and adds a parts cost to that work order.
- **Landlord statements** roll all of a landlord's collected rent and property
  expenses for a period into gross / fee / expenses / net-due, ready to disburse.

Because permissions are enforced by RLS at the database, a user physically cannot read
or write data outside their role — the UI simply reflects what the database allows.

---

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| Login screen loads but sign-in fails | The first admin isn't set up. Redo Part 6, including the `user_roles` insert. |
| App loads blank / "Failed to fetch" | `.env` (local) or Vercel env vars are missing or wrong. Recheck the URL and anon key from Part 1. |
| `supabase db push` errors | Ensure you ran `supabase link` with the right project ref and password. Push again — it resumes. |
| Logo/favicon upload fails | The `branding` bucket is missing or not public. Recheck Part 4. |
| Property photos or documents won't open | The private buckets are missing, or you're signed in as a role without permission. Recheck Part 4 and the user's role. |
| Custom domain shows a redirect loop | Cloudflare SSL is set to Flexible. Change it to Full (strict). |
| Invites do nothing | The `invite-user` edge function isn't deployed. Run `supabase functions deploy invite-user`. |
| Nightly charges didn't run | pg_cron isn't enabled or jobs weren't scheduled. See Part 10; or trigger them from the UI. |

---

## Running a second branded instance for another client

1. Create a **new** Supabase project (Part 1).
2. `supabase link` to the new ref and `supabase db push` (Part 3).
3. Create its three buckets (Part 4).
4. Deploy a separate Vercel project pointing at the new project's URL and anon key
   (Parts 5 and 7), or use Vercel environment overrides per deployment.
5. Bootstrap that project's first admin (Part 6) and set its branding in Settings
   (Part 8).

No code changes are ever required — the branding, currency, domain label and
assistant name all live in each project's `organization_settings` row.
