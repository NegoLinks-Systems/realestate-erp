import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { rpc } from '../../lib/rpc';
import { orgKeys } from '../../api/keys';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { useBranding } from '../../providers/BrandingProvider';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { PageSpinner, Toast } from '../../components/ui/Bits';
import { FEATURE_MODULES, FEATURE_TOGGLES } from './featureCatalog';

export default function FeatureFlags() {
  const { user } = useAuth();
  const perms = usePermissions(user?.id);
  const { settings, isLoading } = useBranding();
  const qc = useQueryClient();
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const isSuperAdmin = perms.roles.includes('super_admin');
  const flags = ((settings as { feature_flags?: Record<string, boolean> } | undefined)?.feature_flags ?? {}) as Record<string, boolean>;

  if (isLoading || !settings) return <PageSpinner />;

  if (!isSuperAdmin) {
    return (
      <Card>
        <CardBody className="flex items-center gap-3 py-8 text-sm text-zinc-500">
          <Lock className="h-5 w-5" /> Feature management is restricted to the Super Admin role.
        </CardBody>
      </Card>
    );
  }

  const setFlag = async (key: string, enabled: boolean) => {
    setSaving(key);
    const next = { ...flags, [key]: enabled };
    const { error } = await supabase.from('organization_settings').update({ feature_flags: next }).eq('singleton', true);
    if (!error) {
      await rpc.logActivity({ module: 'settings', action: 'feature_flag_changed', entityType: 'feature_flag', entityId: key, after: { [key]: enabled } as never });
      await qc.invalidateQueries({ queryKey: orgKeys.settings() });
      setToast(`${key} ${enabled ? 'enabled' : 'disabled'}`);
      setTimeout(() => setToast(null), 2000);
    }
    setSaving(null);
  };

  const isOn = (key: string) => flags[key] !== false;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Modules" subtitle="Turn whole modules on or off across the organization. Disabled modules disappear from navigation for everyone." />
        <CardBody className="divide-y divide-zinc-100 dark:divide-[#1C1C34]">
          {FEATURE_MODULES.map((m) => (
            <FlagRow key={m.key} label={m.label} description={m.description} enabled={isOn(m.key)} saving={saving === m.key} onChange={(v) => setFlag(m.key, v)} />
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Features & beta" subtitle="Optional platform features. Beta features may still be evolving." />
        <CardBody className="divide-y divide-zinc-100 dark:divide-[#1C1C34]">
          {FEATURE_TOGGLES.map((t) => (
            <FlagRow key={t.key} label={t.label} description={t.description} beta={t.beta} enabled={isOn(t.key)} saving={saving === t.key} onChange={(v) => setFlag(t.key, v)} />
          ))}
        </CardBody>
      </Card>
      {toast && <Toast message={toast} tone="ok" />}
    </div>
  );
}

function FlagRow({ label, description, enabled, saving, beta, onChange }: {
  label: string; description: string; enabled: boolean; saving: boolean; beta?: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">{label}</p>
          {beta && <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase" style={{ background: 'var(--accent-glow)', color: 'var(--accent-light)' }}>Beta</span>}
        </div>
        <p className="mt-0.5 text-xs text-zinc-500">{description}</p>
      </div>
      <button
        role="switch" aria-checked={enabled} aria-label={label} disabled={saving}
        onClick={() => onChange(!enabled)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${enabled ? '' : 'bg-zinc-300 dark:bg-[#2A2A40]'} disabled:opacity-50`}
        style={enabled ? { background: 'var(--accent-primary)' } : undefined}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );
}
