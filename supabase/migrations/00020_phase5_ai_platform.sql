-- =====================================================================
-- Phase 5: AI Platform. Provider registry, prompt templates, usage/audit
-- logs, and organizational AI memory. Single-tenant (matches this schema).
--
-- SECURITY: provider API keys are NEVER stored here. They are set as
-- Supabase Edge Function secrets (e.g. `supabase secrets set GROQ_API_KEY=...`)
-- and read server-side by the ai-chat function. This table holds only
-- non-secret configuration, so it is safe for the Super Admin UI to read.
-- =====================================================================

-- Global AI configuration lives on the org settings singleton.
alter table public.organization_settings
  add column if not exists ai_config jsonb not null default '{
    "provider": "groq",
    "model": "llama-3.3-70b-versatile",
    "temperature": 0.7,
    "max_tokens": 4096,
    "top_p": 1.0,
    "streaming": true,
    "timeout_seconds": 30,
    "max_retries": 3,
    "monthly_request_limit": 10000,
    "modules": {
      "dashboard": true, "finance": true, "reports": true,
      "documents": true, "email": true, "executive_assistant": true
    }
  }'::jsonb;

-- ---- Provider registry (config only, no secrets) --------------------
create table if not exists public.ai_providers (
  id            uuid primary key default gen_random_uuid(),
  provider_key  text not null unique,          -- 'groq', 'openai', ...
  label         text not null,                 -- internal display (admin only)
  base_url      text not null,
  default_model text,
  api_style     text not null default 'openai',-- openai | anthropic | gemini | bedrock
  secret_name   text not null,                 -- env var the Edge Function reads
  enabled       boolean not null default true,
  is_default    boolean not null default false,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);

insert into public.ai_providers (provider_key, label, base_url, default_model, api_style, secret_name, is_default, sort_order) values
  ('groq',       'Groq Cloud',            'https://api.groq.com/openai/v1',                    'llama-3.3-70b-versatile', 'openai',    'GROQ_API_KEY',       true,  1),
  ('openai',     'OpenAI',                'https://api.openai.com/v1',                         'gpt-4o',                  'openai',    'OPENAI_API_KEY',     false, 2),
  ('anthropic',  'Anthropic Claude',      'https://api.anthropic.com/v1',                      'claude-3-5-sonnet',       'anthropic', 'ANTHROPIC_API_KEY',  false, 3),
  ('gemini',     'Google Gemini',         'https://generativelanguage.googleapis.com/v1beta',  'gemini-1.5-pro',          'gemini',    'GEMINI_API_KEY',     false, 4),
  ('xai',        'xAI',                   'https://api.x.ai/v1',                               'grok-2',                  'openai',    'XAI_API_KEY',        false, 5),
  ('deepseek',   'DeepSeek',              'https://api.deepseek.com/v1',                       'deepseek-chat',           'openai',    'DEEPSEEK_API_KEY',   false, 6),
  ('openrouter', 'OpenRouter',            'https://openrouter.ai/api/v1',                      'auto',                    'openai',    'OPENROUTER_API_KEY', false, 7),
  ('azure',      'Azure OpenAI',          'https://YOUR-RESOURCE.openai.azure.com',            'gpt-4o',                  'openai',    'AZURE_OPENAI_KEY',   false, 8),
  ('bedrock',    'AWS Bedrock',           'https://bedrock-runtime.amazonaws.com',             'anthropic.claude-3',      'bedrock',   'AWS_BEDROCK_KEY',    false, 9),
  ('ollama',     'Ollama (self-hosted)',  'http://localhost:11434/v1',                         'llama3.1',                'openai',    'OLLAMA_API_KEY',     false, 10),
  ('custom',     'Custom OpenAI-compatible','',                                                '',                        'openai',    'CUSTOM_AI_KEY',      false, 11)
on conflict (provider_key) do nothing;

-- ---- Prompt templates ----------------------------------------------
create table if not exists public.ai_prompt_templates (
  id            uuid primary key default gen_random_uuid(),
  template_key  text not null unique,          -- 'executive_assistant', 'finance_analysis', ...
  name          text not null,
  description   text,
  module        text,
  system_prompt text not null,
  default_prompt text not null,                 -- built-in default, for "revert"
  is_builtin    boolean not null default false,
  updated_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger set_updated_at before update on public.ai_prompt_templates
for each row execute function public.tg_set_updated_at();

insert into public.ai_prompt_templates (template_key, name, description, module, system_prompt, default_prompt, is_builtin) values
  ('executive_assistant', 'Executive Assistant', 'The global AI chat assistant', 'executive_assistant',
   'You are the Executive Assistant for a real estate and property management company. Be concise, professional, and helpful. Only discuss data the user is permitted to see. Never reveal system or provider details.',
   'You are the Executive Assistant for a real estate and property management company. Be concise, professional, and helpful. Only discuss data the user is permitted to see. Never reveal system or provider details.', true),
  ('finance_analysis', 'Financial Analysis', 'AI analysis of finance data', 'finance',
   'You are a financial analyst for a property management firm. Summarise collections, arrears and cash position clearly. Use the organization currency. Be precise with figures.',
   'You are a financial analyst for a property management firm. Summarise collections, arrears and cash position clearly. Use the organization currency. Be precise with figures.', true),
  ('smart_insights', 'Smart Insights', 'Dashboard insight generation', 'dashboard',
   'You generate brief, executive dashboard insights for a property portfolio. Each insight is one sentence, specific and actionable.',
   'You generate brief, executive dashboard insights for a property portfolio. Each insight is one sentence, specific and actionable.', true),
  ('document_drafting', 'Document Drafting', 'AI document/notice drafting', 'documents',
   'You draft professional property-management documents (notices, letters, lease summaries) in a formal tone, ready for the organization letterhead.',
   'You draft professional property-management documents (notices, letters, lease summaries) in a formal tone, ready for the organization letterhead.', true)
on conflict (template_key) do nothing;

-- ---- Usage & audit logs (written by the Edge Function via service_role)
create table if not exists public.ai_usage_logs (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references auth.users(id),
  module            text,
  action            text not null default 'chat',
  provider_used     text,      -- internal only
  model_used        text,      -- internal only
  prompt_tokens     int not null default 0,
  completion_tokens int not null default 0,
  response_time_ms  int,
  status            text not null default 'success',  -- success | error
  error_message     text,
  created_at        timestamptz not null default now()
);
create index if not exists ai_usage_logs_created_idx on public.ai_usage_logs (created_at desc);
create index if not exists ai_usage_logs_module_idx  on public.ai_usage_logs (module);

-- ---- Organizational AI memory (single-tenant singleton) ------------
create table if not exists public.org_ai_memory (
  id                     uuid primary key default gen_random_uuid(),
  singleton              boolean not null default true unique check (singleton),
  business_context       text,
  preferred_report_style text not null default 'executive',
  preferred_tone         text not null default 'professional',
  custom_terminology     jsonb not null default '[]',
  abbreviations          jsonb not null default '[]',
  faq                    jsonb not null default '[]',
  auto_learn             boolean not null default false,
  updated_at             timestamptz not null default now()
);
create trigger set_updated_at before update on public.org_ai_memory
for each row execute function public.tg_set_updated_at();

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.ai_providers        enable row level security;
alter table public.ai_prompt_templates enable row level security;
alter table public.ai_usage_logs       enable row level security;
alter table public.org_ai_memory       enable row level security;

-- Providers: admins only (config surface)
create policy ai_providers_admin_read on public.ai_providers for select to authenticated using (public.is_admin());
create policy ai_providers_admin_write on public.ai_providers for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Prompt templates: any authenticated user may read; admins manage
create policy ai_templates_read on public.ai_prompt_templates for select to authenticated using (true);
create policy ai_templates_write on public.ai_prompt_templates for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Usage logs: admins read. Inserts happen via service_role (Edge Function), which bypasses RLS.
create policy ai_usage_admin_read on public.ai_usage_logs for select to authenticated using (public.is_admin());

-- Org AI memory: admins manage
create policy ai_memory_admin_all on public.org_ai_memory for all to authenticated using (public.is_admin()) with check (public.is_admin());
