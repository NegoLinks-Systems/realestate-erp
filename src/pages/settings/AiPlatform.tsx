import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Sparkles, Lock, KeyRound, RotateCcw, Save } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { useBranding } from '../../providers/BrandingProvider';
import { useOrgSettingsMutation } from './shared';
import type { AiProviderRow, AiPromptTemplateRow, AiUsageLogRow } from '../../lib/database.types';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Field, Input, Select, Textarea } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';
import { KPICard } from '../../components/ui/KPICard';
import { ChartCard } from '../../components/ui/ChartCard';
import { PageSpinner, Toast, EmptyState } from '../../components/ui/Bits';
import { CHART_COLORS, CHART_GRID, CHART_AXIS, chartTooltip } from '../../components/dashboard/chartTheme';

interface AIConfig {
  provider: string; model: string; temperature: number; max_tokens: number;
  top_p: number; streaming: boolean; timeout_seconds: number; max_retries: number;
  monthly_request_limit: number; modules: Record<string, boolean>;
}
const MODULE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard — Smart Insights', finance: 'Finance — AI analysis',
  reports: 'Reports — AI summaries', documents: 'Documents — AI drafting',
  email: 'Email — AI composer', executive_assistant: 'Executive Assistant — global chat',
};

export default function AiPlatform() {
  const { user } = useAuth();
  const perms = usePermissions(user?.id);
  const { settings, isLoading } = useBranding();
  const qc = useQueryClient();
  const mutation = useOrgSettingsMutation('ai_platform');
  const [toast, setToast] = useState<string | null>(null);
  const [cfg, setCfg] = useState<AIConfig | null>(null);

  const isSuperAdmin = perms.roles.includes('super_admin');

  const providers = useQuery({
    queryKey: ['ai-providers'], enabled: isSuperAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from('ai_providers').select('*').order('sort_order');
      if (error) throw new Error(error.message);
      return data as AiProviderRow[];
    },
  });
  const templates = useQuery({
    queryKey: ['ai-templates'], enabled: isSuperAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from('ai_prompt_templates').select('*').order('name');
      if (error) throw new Error(error.message);
      return data as AiPromptTemplateRow[];
    },
  });
  const usage = useQuery({
    queryKey: ['ai-usage'], enabled: isSuperAdmin,
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data, error } = await supabase.from('ai_usage_logs').select('*').gte('created_at', since).order('created_at', { ascending: false }).limit(500);
      if (error) throw new Error(error.message);
      return data as AiUsageLogRow[];
    },
  });

  useEffect(() => {
    if (settings) setCfg((settings as unknown as { ai_config?: AIConfig }).ai_config ?? null);
  }, [settings]);

  const usageStats = useMemo(() => {
    const logs = usage.data ?? [];
    const today = new Date().toDateString();
    const reqToday = logs.filter((l) => new Date(l.created_at).toDateString() === today).length;
    const tokens = logs.reduce((s, l) => s + l.prompt_tokens + l.completion_tokens, 0);
    const errors = logs.filter((l) => l.status === 'error').length;
    const avgLatency = logs.length ? Math.round(logs.reduce((s, l) => s + (l.response_time_ms ?? 0), 0) / logs.length) : 0;
    const byModule = new Map<string, number>();
    for (const l of logs) byModule.set(l.module ?? 'other', (byModule.get(l.module ?? 'other') ?? 0) + 1);
    return {
      reqToday, total: logs.length, tokens, errors, avgLatency,
      errorRate: logs.length ? Math.round((errors / logs.length) * 1000) / 10 : 0,
      byModule: [...byModule.entries()].map(([module, count]) => ({ module, count })),
    };
  }, [usage.data]);

  if (isLoading || !settings) return <PageSpinner />;
  if (!isSuperAdmin) {
    return <Card><CardBody className="flex items-center gap-3 py-8 text-sm text-zinc-500"><Lock className="h-5 w-5" /> The AI Platform is restricted to the Super Admin role.</CardBody></Card>;
  }
  if (!cfg) return <PageSpinner />;

  const saveConfig = async () => {
    await mutation.mutateAsync({ ai_config: cfg as never });
    await qc.invalidateQueries({ queryKey: ['ai-usage'] });
    setToast('AI configuration saved'); setTimeout(() => setToast(null), 2500);
  };
  const setModule = (key: string, on: boolean) => setCfg({ ...cfg, modules: { ...cfg.modules, [key]: on } });

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5" style={{ color: 'var(--accent-light)' }} />
        <div>
          <h2 className="font-display text-lg font-semibold">NegoLinks Intelligence Engine</h2>
          <p className="text-xs text-zinc-500">Configure how AI assistance works across the platform.</p>
        </div>
      </div>

      {/* Provider & parameters */}
      <Card>
        <CardHeader title="AI provider & model" subtitle="The active provider and generation settings. End users never see provider or model names." />
        <CardBody className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Provider">
              <Select value={cfg.provider} onChange={(e) => setCfg({ ...cfg, provider: e.target.value })}>
                {(providers.data ?? []).map((p) => <option key={p.provider_key} value={p.provider_key}>{p.label}{p.is_default ? ' (default)' : ''}</option>)}
              </Select>
            </Field>
            <Field label="Model" hint="Free text — must match a model your provider account can access.">
              <Input value={cfg.model} onChange={(e) => setCfg({ ...cfg, model: e.target.value })} className="font-mono text-xs" />
            </Field>
            <Field label={`Temperature — ${cfg.temperature}`}>
              <input type="range" min={0} max={2} step={0.1} value={cfg.temperature} onChange={(e) => setCfg({ ...cfg, temperature: Number(e.target.value) })} className="w-full accent-[var(--accent-primary)]" />
            </Field>
            <Field label="Max tokens">
              <Input type="number" value={cfg.max_tokens} onChange={(e) => setCfg({ ...cfg, max_tokens: Number(e.target.value) })} />
            </Field>
            <Field label="Timeout (seconds)">
              <Input type="number" value={cfg.timeout_seconds} onChange={(e) => setCfg({ ...cfg, timeout_seconds: Number(e.target.value) })} />
            </Field>
            <Field label="Monthly request limit">
              <Input type="number" value={cfg.monthly_request_limit} onChange={(e) => setCfg({ ...cfg, monthly_request_limit: Number(e.target.value) })} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={cfg.streaming} onChange={(e) => setCfg({ ...cfg, streaming: e.target.checked })} className="accent-[var(--accent-primary)]" />
            Enable response streaming
          </label>

          <div className="flex items-start gap-2 rounded-lg border border-[var(--accent-border)] bg-[var(--accent-glow)] p-3 text-xs text-[#CBD5E1]">
            <KeyRound className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Provider API keys are stored as server secrets, never in the database or browser. Set the active provider's key with, e.g., <code className="rounded bg-black/30 px-1 font-mono">supabase secrets set {(providers.data ?? []).find((p) => p.provider_key === cfg.provider)?.secret_name ?? 'GROQ_API_KEY'}=…</code> and deploy the <code className="rounded bg-black/30 px-1 font-mono">ai-chat</code> function. Until then the assistant shows a friendly “not configured” message.</p>
          </div>

          <div className="flex justify-end">
            <Button onClick={saveConfig} disabled={mutation.isPending}><Save className="h-4 w-4" /> {mutation.isPending ? 'Saving…' : 'Save configuration'}</Button>
          </div>
        </CardBody>
      </Card>

      {/* Module AI controls */}
      <Card>
        <CardHeader title="Module AI controls" subtitle="Turn AI assistance on or off per area. Changes save with the configuration above." />
        <CardBody className="divide-y divide-zinc-100 dark:divide-[#1C1C34]">
          {Object.keys(MODULE_LABELS).map((key) => (
            <div key={key} className="flex items-center justify-between py-3">
              <span className="text-sm">{MODULE_LABELS[key]}</span>
              <button role="switch" aria-checked={cfg.modules[key] !== false} aria-label={MODULE_LABELS[key]}
                onClick={() => setModule(key, cfg.modules[key] === false)}
                className={`relative h-6 w-11 rounded-full transition-colors ${cfg.modules[key] !== false ? '' : 'bg-zinc-300 dark:bg-[#2A2A40]'}`}
                style={cfg.modules[key] !== false ? { background: 'var(--accent-primary)' } : undefined}>
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${cfg.modules[key] !== false ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
          ))}
        </CardBody>
      </Card>

      {/* Prompt templates */}
      <Card>
        <CardHeader title="Prompt templates" subtitle="The system instructions behind each AI feature. Edit and revert as needed." />
        <CardBody className="space-y-4">
          {(templates.data ?? []).map((t) => <TemplateEditor key={t.id} tpl={t} onSaved={() => { qc.invalidateQueries({ queryKey: ['ai-templates'] }); setToast('Template saved'); setTimeout(() => setToast(null), 2000); }} />)}
        </CardBody>
      </Card>

      {/* Usage monitoring */}
      <Card>
        <CardHeader title="Usage & audit" subtitle="AI activity over the last 30 days. Provider and model details are recorded internally only." />
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KPICard title="Requests today" value={usageStats.reqToday} icon={Sparkles} />
            <KPICard title="Requests (30d)" value={usageStats.total} icon={Sparkles} />
            <KPICard title="Tokens (30d)" value={usageStats.tokens.toLocaleString()} icon={Sparkles} />
            <KPICard title="Error rate" value={`${usageStats.errorRate}%`} trend={`${usageStats.avgLatency}ms avg`} trendUp={usageStats.errorRate < 5} icon={Sparkles} />
          </div>
          {usageStats.byModule.length > 0 ? (
            <ChartCard title="Requests by module">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={usageStats.byModule} margin={{ left: -12, right: 8, top: 4 }}>
                  <CartesianGrid stroke={CHART_GRID} vertical={false} />
                  <XAxis dataKey="module" stroke={CHART_AXIS} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis stroke={CHART_AXIS} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={28} allowDecimals={false} />
                  <Tooltip {...chartTooltip} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
                  <Bar dataKey="count" name="Requests" radius={[4, 4, 0, 0]} fill={CHART_COLORS[0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          ) : (
            <EmptyState icon={Sparkles} title="No AI activity yet" hint="Usage and audit records appear here once the assistant is configured and used." />
          )}
        </CardBody>
      </Card>
      {toast && <Toast message={toast} tone="ok" />}
    </div>
  );
}

function TemplateEditor({ tpl, onSaved }: { tpl: AiPromptTemplateRow; onSaved: () => void }) {
  const [value, setValue] = useState(tpl.system_prompt);
  const [busy, setBusy] = useState(false);
  const dirty = value !== tpl.system_prompt;
  const isDefault = value === tpl.default_prompt;

  const save = async () => {
    setBusy(true);
    await supabase.from('ai_prompt_templates').update({ system_prompt: value }).eq('id', tpl.id);
    setBusy(false); onSaved();
  };
  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-[#1C1C34]">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{tpl.name}</p>
          {tpl.description && <p className="text-xs text-zinc-500">{tpl.description}</p>}
        </div>
        <div className="flex items-center gap-2">
          {!isDefault && <Button variant="ghost" onClick={() => setValue(tpl.default_prompt)} title="Revert to default"><RotateCcw className="h-3.5 w-3.5" /> Revert</Button>}
          <Button onClick={save} disabled={!dirty || busy}>{busy ? 'Saving…' : 'Save'}</Button>
        </div>
      </div>
      <Textarea value={value} onChange={(e) => setValue(e.target.value)} rows={3} className="font-mono text-xs" />
    </div>
  );
}
