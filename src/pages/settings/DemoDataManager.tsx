import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Database, Lock, RefreshCw, Trash2, Wand2, Zap } from 'lucide-react';
import { rpc } from '../../lib/rpc';
import { orgKeys } from '../../api/keys';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { useBranding } from '../../providers/BrandingProvider';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Field';
import { Dialog } from '../../components/ui/Dialog';
import { PageSpinner, Toast } from '../../components/ui/Bits';

const SCENARIOS = [
  { key: 'small', label: 'Small Organization', hint: '2 properties · ~12 units' },
  { key: 'medium', label: 'Medium Organization', hint: '4 properties · ~40 units' },
  { key: 'large', label: 'Large Enterprise', hint: '8 properties · ~110 units' },
  { key: 'multi_branch', label: 'Multi-Branch Enterprise', hint: '3 branches · 6 properties' },
  { key: 'heavy', label: 'Enterprise · Heavy Transactions', hint: '6 properties · dense billing' },
];

export default function DemoDataManager() {
  const { user } = useAuth();
  const perms = usePermissions(user?.id);
  const { settings, isLoading } = useBranding();
  const qc = useQueryClient();
  const [scenario, setScenario] = useState('medium');
  const [busy, setBusy] = useState<null | 'load' | 'reload' | 'delete'>(null);
  const [confirm, setConfirm] = useState<null | 'load' | 'reload' | 'delete'>(null);
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'err' } | null>(null);
  const flash = (msg: string, tone: 'ok' | 'err' = 'ok') => { setToast({ msg, tone }); setTimeout(() => setToast(null), 4500); };

  const isSuperAdmin = perms.roles.includes('super_admin');
  const demoActive = (settings as { demo_mode?: boolean } | undefined)?.demo_mode ?? false;

  if (isLoading || !settings) return <PageSpinner />;

  if (!isSuperAdmin) {
    return (
      <Card>
        <CardBody className="flex items-center gap-3 py-8 text-sm text-zinc-500">
          <Lock className="h-5 w-5" /> The Demo Data Manager is restricted to the Super Admin role.
        </CardBody>
      </Card>
    );
  }

  const refresh = () => qc.invalidateQueries({ queryKey: orgKeys.settings() });

  const doLoad = async () => {
    setBusy('load'); setConfirm(null);
    try {
      const r = await rpc.loadDemoData(scenario);
      await rpc.logActivity({ module: 'settings', action: 'demo_data_loaded', entityType: 'demo_data', entityId: scenario, after: r as never });
      await refresh();
      flash(`Demo data loaded — ${r.properties} properties, ${r.units} units, ${r.active_leases} leases, ${r.invoices} invoices.`);
    } catch (e) { flash((e as Error).message, 'err'); } finally { setBusy(null); }
  };

  const doReload = async () => {
    setBusy('reload'); setConfirm(null);
    try {
      const r = await rpc.loadDemoData(scenario); // load_demo_data purges prior demo set first
      await rpc.logActivity({ module: 'settings', action: 'demo_data_reloaded', entityType: 'demo_data', entityId: scenario, after: r as never });
      await refresh();
      flash(`Demo data regenerated — a fresh ${SCENARIOS.find((s) => s.key === scenario)?.label} dataset.`);
    } catch (e) { flash((e as Error).message, 'err'); } finally { setBusy(null); }
  };

  const doDelete = async () => {
    setBusy('delete'); setConfirm(null);
    try {
      await rpc.deleteDemoData();
      await rpc.logActivity({ module: 'settings', action: 'demo_data_deleted', entityType: 'demo_data', entityId: 'all' });
      await refresh();
      flash('All demo data removed. Your real business data is untouched.');
    } catch (e) { flash((e as Error).message, 'err'); } finally { setBusy(null); }
  };

  return (
    <div className="space-y-5">
      {demoActive && (
        <div className="flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold"
          style={{ background: 'linear-gradient(90deg, var(--accent-glow), transparent)', borderColor: 'var(--accent-border)', color: 'var(--accent-light)' }}>
          <Zap className="h-4 w-4" /> DEMO MODE is active — sample data is loaded and a banner is shown across the app.
        </div>
      )}

      <Card>
        <CardHeader
          title="Demo Data Manager"
          subtitle="Populate the system with realistic, interconnected sample data for demos, training and evaluation. Everything created here is tagged as demo and can be removed in one click."
        />
        <CardBody className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Scenario</span>
              <Select value={scenario} onChange={(e) => setScenario(e.target.value)} disabled={busy !== null}>
                {SCENARIOS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </Select>
              <span className="mt-1 block text-xs text-zinc-500">{SCENARIOS.find((s) => s.key === scenario)?.hint}</span>
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            {!demoActive ? (
              <Button onClick={() => setConfirm('load')} disabled={busy !== null}>
                <Wand2 className="h-4 w-4" /> {busy === 'load' ? 'Generating…' : 'Load demo data'}
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setConfirm('reload')} disabled={busy !== null}>
                <RefreshCw className="h-4 w-4" /> {busy === 'reload' ? 'Regenerating…' : 'Reload (new dataset)'}
              </Button>
            )}
            {demoActive && (
              <Button variant="danger" onClick={() => setConfirm('delete')} disabled={busy !== null}>
                <Trash2 className="h-4 w-4" /> {busy === 'delete' ? 'Removing…' : 'Delete demo data'}
              </Button>
            )}
          </div>

          <div className="flex items-start gap-2 rounded-lg bg-zinc-50 p-3 text-xs text-zinc-500 dark:bg-[#0E0E1C]">
            <Database className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Demo data flows through the same rules as real data — leases occupy units, invoices and payments feed the dashboards, and everything respects your permissions. Deleting it removes only demo-tagged records.</p>
          </div>
        </CardBody>
      </Card>

      {/* Load confirmation */}
      <Dialog open={confirm === 'load'} onClose={() => setConfirm(null)} title="Load demonstration data?">
        <div className="space-y-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            This will insert realistic demonstration data across properties, tenants, leases, finance and maintenance. It is clearly tagged as demo data and can be removed at any time. A <strong>DEMO MODE</strong> banner will appear across the app while it is loaded.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button onClick={doLoad}>Load demo data</Button>
          </div>
        </div>
      </Dialog>

      {/* Reload confirmation */}
      <Dialog open={confirm === 'reload'} onClose={() => setConfirm(null)} title="Regenerate demo data?">
        <div className="space-y-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            The current demo dataset will be replaced with a completely new set of demonstration data (different properties, tenants and figures). Your real business data is not affected.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button onClick={doReload}>Regenerate</Button>
          </div>
        </div>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={confirm === 'delete'} onClose={() => setConfirm(null)} title="Delete all demo data?">
        <div className="space-y-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            All demonstration data will be <strong>permanently removed</strong> and the system restored to a clean, production-ready state. Your real business data will remain untouched. This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button variant="danger" onClick={doDelete}>Delete demo data</Button>
          </div>
        </div>
      </Dialog>
      {toast && <Toast message={toast.msg} tone={toast.tone} />}
    </div>
  );
}
