import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { rpc } from '../../../lib/rpc';
import { propertyKeys } from '../../../api/keys';
import { useAuth } from '../../../hooks/useAuth';
import { usePermissions } from '../../../hooks/usePermissions';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Field, Input, Textarea } from '../../../components/ui/Field';
import { Dialog } from '../../../components/ui/Dialog';
import { EmptyState, PageSpinner, Toast } from '../../../components/ui/Bits';
import { usePropertyId } from '../PropertyDetail';

export default function ParcelsTab() {
  const propertyId = usePropertyId();
  const { user } = useAuth();
  const perms = usePermissions(user?.id);
  const qc = useQueryClient();
  const canEdit = perms.can('properties', 'update');
  const [addOpen, setAddOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'err' } | null>(null);
  const flash = (msg: string, tone: 'ok' | 'err' = 'ok') => { setToast({ msg, tone }); setTimeout(() => setToast(null), 3000); };

  const parcels = useQuery({
    queryKey: propertyKeys.parcels(propertyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('land_parcels').select('*')
        .eq('property_id', propertyId).is('deleted_at', null).order('created_at');
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const add = useMutation({
    mutationFn: async (values: { parcel_number: string; title_type: string; title_number: string; size_sqm: string; survey_plan_no: string; notes: string }) => {
      const { data, error } = await supabase
        .from('land_parcels')
        .insert({
          property_id: propertyId,
          parcel_number: values.parcel_number || null,
          title_type: values.title_type || null,
          title_number: values.title_number || null,
          size_sqm: values.size_sqm ? Number(values.size_sqm) : null,
          survey_plan_no: values.survey_plan_no || null,
          notes: values.notes || null,
        })
        .select().single();
      if (error) throw new Error(error.message);
      await rpc.logActivity({ module: 'properties', action: 'parcel_added', entityType: 'land_parcel', entityId: data.id });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: propertyKeys.parcels(propertyId) });
      setAddOpen(false);
      flash('Parcel recorded');
    },
    onError: (e) => flash((e as Error).message, 'err'),
  });

  if (parcels.isLoading) return <PageSpinner />;
  const list = parcels.data ?? [];

  return (
    <Card>
      <CardHeader
        title="Land parcels"
        subtitle="Title and survey records for this land."
        action={canEdit ? (
          <Button variant="outline" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> Add parcel
          </Button>
        ) : undefined}
      />
      <CardBody>
        {list.length === 0 ? (
          <EmptyState title="No parcels recorded" hint="Capture title type, title number, and survey plan for each parcel." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
                  <th className="py-2 pr-4">Parcel</th>
                  <th className="py-2 pr-4">Title</th>
                  <th className="py-2 pr-4">Title no.</th>
                  <th className="py-2 pr-4">Size (sqm)</th>
                  <th className="py-2 pr-4">Survey plan</th>
                </tr>
              </thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id} className="border-b border-zinc-100 dark:border-zinc-800/60">
                    <td className="py-2.5 pr-4 font-mono text-xs">{p.parcel_number ?? '—'}</td>
                    <td className="py-2.5 pr-4">{p.title_type ?? '—'}</td>
                    <td className="py-2.5 pr-4 font-mono text-xs">{p.title_number ?? '—'}</td>
                    <td className="py-2.5 pr-4 tabular-nums">{p.size_sqm ?? '—'}</td>
                    <td className="py-2.5 pr-4 font-mono text-xs">{p.survey_plan_no ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} title="Add land parcel">
        <ParcelForm pending={add.isPending} onSubmit={(v) => add.mutate(v)} />
      </Dialog>
      {toast && <Toast message={toast.msg} tone={toast.tone} />}
    </Card>
  );
}

function ParcelForm({ onSubmit, pending }: { onSubmit: (v: { parcel_number: string; title_type: string; title_number: string; size_sqm: string; survey_plan_no: string; notes: string }) => void; pending: boolean }) {
  const [v, setV] = useState({ parcel_number: '', title_type: '', title_number: '', size_sqm: '', survey_plan_no: '', notes: '' });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setV((s) => ({ ...s, [k]: e.target.value }));
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Parcel number"><Input value={v.parcel_number} onChange={set('parcel_number')} /></Field>
      <Field label="Title type" hint="e.g. C of O, Deed of Assignment"><Input value={v.title_type} onChange={set('title_type')} /></Field>
      <Field label="Title number"><Input value={v.title_number} onChange={set('title_number')} /></Field>
      <Field label="Size (sqm)"><Input type="number" step="0.01" value={v.size_sqm} onChange={set('size_sqm')} /></Field>
      <div className="md:col-span-2">
        <Field label="Survey plan number"><Input value={v.survey_plan_no} onChange={set('survey_plan_no')} /></Field>
      </div>
      <div className="md:col-span-2">
        <Field label="Notes"><Textarea rows={2} value={v.notes} onChange={set('notes')} /></Field>
      </div>
      <div className="flex justify-end md:col-span-2">
        <Button onClick={() => onSubmit(v)} disabled={pending}>{pending ? 'Saving…' : 'Add parcel'}</Button>
      </div>
    </div>
  );
}
