-- =====================================================================
-- Phase 6: notification channels groundwork.
-- In-app notifications already exist; this adds per-user channel
-- preferences and org-level channel enablement. Actual sending on
-- email/SMS/WhatsApp/push is delivered by the Communication Center
-- (Phase 7) via Edge Functions + provider credentials.
-- =====================================================================

-- Org-level: which channels are enabled + configured (non-secret config).
alter table public.organization_settings
  add column if not exists notification_config jsonb not null default '{
    "channels": { "in_app": true, "email": false, "sms": false, "whatsapp": false, "push": false }
  }'::jsonb;

-- Per-user channel preferences (opt in/out). One row per user.
create table if not exists public.notification_preferences (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references auth.users(id) on delete cascade,
  in_app      boolean not null default true,
  email       boolean not null default true,
  sms         boolean not null default false,
  whatsapp    boolean not null default false,
  push        boolean not null default false,
  digest      text    not null default 'instant',  -- instant | daily | off
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger set_updated_at before update on public.notification_preferences
for each row execute function public.tg_set_updated_at();

alter table public.notification_preferences enable row level security;

-- Users manage their own preferences; admins may view all.
create policy notif_prefs_self on public.notification_preferences
  for all to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid());

-- Helper: effective channels for a user = org-enabled channels AND the user's opt-ins.
-- Returns a jsonb object of channel -> bool. Used by the Phase 7 dispatcher.
create or replace function public.effective_notification_channels(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'in_app',   coalesce(p.in_app,   true) and coalesce((o.notification_config->'channels'->>'in_app')::boolean,   true),
    'email',    coalesce(p.email,    true) and coalesce((o.notification_config->'channels'->>'email')::boolean,    false),
    'sms',      coalesce(p.sms,      false) and coalesce((o.notification_config->'channels'->>'sms')::boolean,     false),
    'whatsapp', coalesce(p.whatsapp, false) and coalesce((o.notification_config->'channels'->>'whatsapp')::boolean,false),
    'push',     coalesce(p.push,     false) and coalesce((o.notification_config->'channels'->>'push')::boolean,    false)
  )
  from public.organization_settings o
  left join public.notification_preferences p on p.user_id = p_user
  where o.singleton;
$$;
