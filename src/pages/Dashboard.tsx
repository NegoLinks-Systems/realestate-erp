import { useQuery } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';
import { Building2, DoorOpen, FileSignature, Home, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { rpc } from '../lib/rpc';
import { propertyKeys } from '../api/keys';
import { useAuth } from '../hooks/useAuth';
import { usePermissions } from '../hooks/usePermissions';
import { useBranding } from '../providers/BrandingProvider';
import { Card, CardBody } from '../components/ui/Card';
import { PageSpinner } from '../components/ui/Bits';

export default function Dashboard() {
  const { user } = useAuth();
  const perms = usePermissions(user?.id);
  const { organizationName } = useBranding();

  const stats = useQuery({
    queryKey: propertyKeys.stats(),
    queryFn: rpc.portfolioStats,
    enabled: perms.can('properties', 'view') || perms.isAdmin,
  });

  const expiring = useQuery({
    queryKey: ['dashboard-expiring'],
    enabled: perms.can('leases', 'view') || perms.isAdmin,
    queryFn: async () => {
      const horizon = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
      const { count, error } = await supabase
        .from('leases')
        .select('id', { count: 'exact', head: true })
        .in('status', ['active', 'expiring'])
        .lte('end_date', horizon)
        .is('deleted_at', null);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
  });

  const counts = useQuery({
    queryKey: ['dashboard-counts'],
    queryFn: async () => {
      const [branches, users] = await Promise.all([
        supabase.from('branches').select('id', { count: 'exact', head: true }).is('deleted_at', null),
        supabase.from('user_profiles').select('id', { count: 'exact', head: true }).is('deleted_at', null),
      ]);
      return { branches: branches.count ?? 0, users: users.count ?? 0 };
    },
    enabled: perms.can('branches', 'view') || perms.isAdmin,
  });

  if (perms.isLoading) return <PageSpinner />;

  // Tenant-only accounts live in the portal, not the staff dashboard.
  if (perms.roles.includes('tenant') && !perms.isAdmin && !perms.can('properties', 'view')) {
    return <Navigate to="/portal" replace />;
  }

  const s = stats.data;
  const canPortfolio = perms.can('properties', 'view') || perms.isAdmin;

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <p className="text-[11px] uppercase tracking-widest text-zinc-500">{organizationName}</p>
      <h1 className="mt-1 font-display text-xl font-semibold">Executive dashboard</h1>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {canPortfolio && (
          <>
            <Stat icon={Building2} label="Properties" value={s?.total_properties} loading={stats.isLoading} />
            <Stat icon={Home} label="Units" value={s?.total_units} loading={stats.isLoading} />
            <Stat icon={DoorOpen} label="Vacant units" value={s?.vacant_units} loading={stats.isLoading} />
            <Stat
              icon={Building2}
              label="Occupancy"
              value={s ? `${s.occupancy_rate}%` : undefined}
              loading={stats.isLoading}
              accent
            />
          </>
        )}
        {(perms.can('leases', 'view') || perms.isAdmin) && (
          <Stat icon={FileSignature} label="Leases expiring (90d)" value={expiring.data} loading={expiring.isLoading} accent={Boolean(expiring.data && expiring.data > 0)} />
        )}
        {counts.data && (
          <>
            <Stat icon={Building2} label="Branches" value={counts.data.branches} loading={counts.isLoading} />
            <Stat icon={Users} label="Team members" value={counts.data.users} loading={counts.isLoading} />
          </>
        )}
      </div>

      {canPortfolio && s?.total_properties === 0 && (
        <Card className="mt-6">
          <CardBody>
            <p className="text-sm font-medium">Your portfolio is empty — and that's expected.</p>
            <p className="mt-1 text-sm text-zinc-500">
              The Properties module ships in the next phase. These numbers are live and will light up the moment the
              first property is created.
            </p>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function Stat({
  icon: Icon, label, value, loading, accent = false,
}: {
  icon: typeof Building2;
  label: string;
  value: number | string | undefined;
  loading: boolean;
  accent?: boolean;
}) {
  return (
    <Card>
      <CardBody>
        <div className="flex items-center gap-2 text-zinc-500">
          <Icon className="h-4 w-4" />
          <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
        </div>
        <p className={`mt-2 font-display text-3xl font-semibold tabular-nums ${accent ? 'text-brand' : ''}`}>
          {loading ? '·' : value ?? '—'}
        </p>
        {accent && <div className="mt-2 h-0.5 w-10 rounded bg-brand" />}
      </CardBody>
    </Card>
  );
}
