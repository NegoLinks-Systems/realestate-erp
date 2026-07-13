import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { propertyKeys, unitKeys } from '../../../api/keys';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { PageSpinner } from '../../../components/ui/Bits';
import { SignedImage } from '../../../hooks/useSignedUrl';
import { useProperty, usePropertyId } from '../PropertyDetail';
import { UnitStatusBadge } from '../shared';
import type { UnitStatus } from '../../../lib/database.types';

const STATUSES: UnitStatus[] = ['available', 'occupied', 'reserved', 'maintenance', 'unlisted'];

export default function OverviewTab() {
  const id = usePropertyId();
  const property = useProperty();

  const units = useQuery({
    queryKey: unitKeys.list(id),
    queryFn: async () => {
      const { data, error } = await supabase.from('units').select('id, status').eq('property_id', id).is('deleted_at', null);
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const cover = useQuery({
    queryKey: [...propertyKeys.photos(id), 'cover'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('property_photos')
        .select('storage_path, is_cover')
        .eq('property_id', id)
        .is('deleted_at', null)
        .order('is_cover', { ascending: false })
        .order('sort_order')
        .limit(1);
      if (error) throw new Error(error.message);
      return data[0] ?? null;
    },
  });

  if (units.isLoading || property.isLoading) return <PageSpinner />;
  const p = property.data;
  const list = units.data ?? [];
  const byStatus = (s: UnitStatus) => list.filter((u) => u.status === s).length;

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader title="Unit summary" subtitle={`${list.length} unit${list.length === 1 ? '' : 's'} recorded`} />
        <CardBody className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {STATUSES.map((s) => (
            <div key={s}>
              <p className="font-display text-2xl font-semibold tabular-nums">{byStatus(s)}</p>
              <div className="mt-1"><UnitStatusBadge status={s} /></div>
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="At a glance" />
        <CardBody className="space-y-2 text-sm">
          <Row label="Code" value={p?.code ?? '—'} mono />
          <Row label="Year built" value={p?.year_built?.toString() ?? '—'} />
          <Row label="Country" value={p?.country ?? '—'} />
          {p?.description && <p className="pt-2 text-zinc-600 dark:text-zinc-300">{p.description}</p>}
        </CardBody>
      </Card>

      {cover.data && (
        <Card className="lg:col-span-3">
          <CardBody>
            <SignedImage path={cover.data.storage_path} alt="" className="h-56 w-full rounded-md object-cover" />
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-zinc-500">{label}</span>
      <span className={mono ? 'font-mono text-xs' : ''}>{value}</span>
    </div>
  );
}
