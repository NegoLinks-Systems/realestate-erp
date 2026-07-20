import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Mail, MessageSquare, Smartphone, Send } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { useBranding } from '../../providers/BrandingProvider';
import { useOrgSettingsMutation } from './shared';
import type { NotificationPreferenceRow } from '../../lib/database.types';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Select } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';
import { PageSpinner, Toast } from '../../components/ui/Bits';

const CHANNELS: { key: 'in_app' | 'email' | 'sms' | 'whatsapp' | 'push'; label: string; icon: typeof Bell; note?: string }[] = [
  { key: 'in_app', label: 'In-app', icon: Bell },
  { key: 'email', label: 'Email', icon: Mail },
  { key: 'sms', label: 'SMS', icon: MessageSquare },
  { key: 'whatsapp', label: 'WhatsApp', icon: Send },
  { key: 'push', label: 'Push', icon: Smartphone },
];

export default function NotificationPreferences() {
  const { user } = useAuth();
  const perms = usePermissions(user?.id);
  const { settings } = useBranding();
  const qc = useQueryClient();
  const orgMutation = useOrgSettingsMutation('notifications');
  const [toast, setToast] = useState<string | null>(null);
  const isAdmin = perms.isAdmin;

  const prefsQuery = useQuery({
    queryKey: ['notif-prefs', user?.id], enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from('notification_preferences').select('*').eq('user_id', user!.id).maybeSingle();
      if (error) throw new Error(error.message);
      return data as NotificationPreferenceRow | null;
    },
  });

  const [prefs, setPrefs] = useState<Record<string, boolean>>({ in_app: true, email: true, sms: false, whatsapp: false, push: false });
  const [digest, setDigest] = useState('instant');
  const orgChannels = ((settings as { notification_config?: { channels?: Record<string, boolean> } } | undefined)?.notification_config?.channels ?? {}) as Record<string, boolean>;
  const [orgCfg, setOrgCfg] = useState<Record<string, boolean>>(orgChannels);

  useEffect(() => {
    const p = prefsQuery.data;
    if (p) { setPrefs({ in_app: p.in_app, email: p.email, sms: p.sms, whatsapp: p.whatsapp, push: p.push }); setDigest(p.digest); }
  }, [prefsQuery.data]);
  useEffect(() => { setOrgCfg(orgChannels); /* eslint-disable-next-line */ }, [settings]);

  if (prefsQuery.isLoading) return <PageSpinner />;

  const savePrefs = async () => {
    const row = { user_id: user!.id, ...prefs, digest };
    const { error } = await supabase.from('notification_preferences').upsert(row, { onConflict: 'user_id' });
    if (!error) { await qc.invalidateQueries({ queryKey: ['notif-prefs', user?.id] }); setToast('Your notification preferences were saved'); setTimeout(() => setToast(null), 2500); }
  };
  const saveOrg = async () => {
    await orgMutation.mutateAsync({ notification_config: { channels: orgCfg } as never });
    setToast('Organization channels updated'); setTimeout(() => setToast(null), 2500);
  };

  return (
    <div className="space-y-5">
      {isAdmin && (
        <Card>
          <CardHeader title="Organization channels" subtitle="Which delivery channels are available across the organization. A channel a user selects only sends if it's enabled here." />
          <CardBody className="space-y-4">
            <div className="divide-y divide-zinc-100 dark:divide-[#1C1C34]">
              {CHANNELS.map(({ key, label, icon: Icon }) => (
                <div key={key} className="flex items-center justify-between py-3">
                  <span className="flex items-center gap-2 text-sm"><Icon className="h-4 w-4 text-zinc-400" /> {label}</span>
                  <Toggle on={orgCfg[key] ?? (key === 'in_app')} onChange={(v) => setOrgCfg({ ...orgCfg, [key]: v })} disabled={key === 'in_app'} />
                </div>
              ))}
            </div>
            <p className="text-xs text-zinc-500">In-app is always on. Email/SMS/WhatsApp/Push require provider setup in the Communication Center before messages are delivered.</p>
            <div className="flex justify-end"><Button onClick={saveOrg} disabled={orgMutation.isPending}>{orgMutation.isPending ? 'Saving…' : 'Save channels'}</Button></div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="My notifications" subtitle="Choose how you'd like to be notified. You'll only receive messages on channels enabled for the organization." />
        <CardBody className="space-y-4">
          <div className="divide-y divide-zinc-100 dark:divide-[#1C1C34]">
            {CHANNELS.map(({ key, label, icon: Icon }) => {
              const orgOff = !(orgCfg[key] ?? (key === 'in_app'));
              return (
                <div key={key} className="flex items-center justify-between py-3">
                  <span className="flex items-center gap-2 text-sm">
                    <Icon className="h-4 w-4 text-zinc-400" /> {label}
                    {orgOff && key !== 'in_app' && <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-[#1C1C34]">unavailable</span>}
                  </span>
                  <Toggle on={prefs[key]} onChange={(v) => setPrefs({ ...prefs, [key]: v })} disabled={key === 'in_app' || orgOff} />
                </div>
              );
            })}
          </div>
          <label className="block max-w-xs">
            <span className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Email digest</span>
            <Select value={digest} onChange={(e) => setDigest(e.target.value)}>
              <option value="instant">Send immediately</option>
              <option value="daily">Daily summary</option>
              <option value="off">No email digest</option>
            </Select>
          </label>
          <div className="flex justify-end"><Button onClick={savePrefs}>Save my preferences</Button></div>
        </CardBody>
      </Card>
      {toast && <Toast message={toast} tone="ok" />}
    </div>
  );
}

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? '' : 'bg-zinc-300 dark:bg-[#2A2A40]'} disabled:opacity-50`}
      style={on ? { background: 'var(--accent-primary)' } : undefined}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  );
}
