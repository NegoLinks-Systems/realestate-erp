# Real Estate ERP

> **Deploying for the first time? Follow [`SETUP_GUIDE.md`](./SETUP_GUIDE.md)** — a complete, step-by-step walkthrough from zero to a live, branded instance.

White-label Real Estate & Property Management ERP. Backend (18 tested
migrations, Phases 0–7 of the data layer) + the complete Phase 0–7
application: auth, app shell, Settings Center, users & permissions,
activity log, executive dashboard, and the full property portfolio
module (properties, buildings/floors, bulk unit generation, units,
photos, documents, manager assignment, land parcels), plus tenants,
landlords with ownership records, the full lease lifecycle
(create/activate/terminate/renew with automatic unit status), and a
tenant self-service portal.

## Run locally
```bash
cp .env.example .env    # fill VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

## Point it at your live Supabase project
1. Migrations 00001–00018 applied (`supabase db push` if not).
2. Storage → create a **public** bucket named `branding` and a
   **private** bucket named `property-media`, and a **private** bucket
   named `tenant-documents`.
3. `supabase functions deploy invite-user` (enables the Invite button).
4. First admin: create a user in Auth, then
   `insert into user_roles (user_id, role) values ('<uuid>','super_admin');`

## Deploy
Full walkthrough (Vercel + Cloudflare custom domain, nightly job,
troubleshooting): **docs/DEPLOYMENT_GUIDE.md**. `vercel.json` is
already included.

## Continue building
Next modules ship by running the phase prompts in docs/ROADMAP.md with
Claude Code — see docs/KICKOFF.md §6. The database for Phases 1–7 is
already live; those sessions build UI only.
