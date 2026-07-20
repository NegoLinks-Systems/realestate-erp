import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { rpc } from '../../lib/rpc';
import { facilityKeys, propertyKeys } from '../../api/keys';
import type { InspectionStatus } from '../../lib/database.types';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Field, Input, Select, Textarea } from '../../components/ui/Field';
import { Dialog } from '../../components/ui/Dialog';
import { EmptyState, PageSpinner, Toast } from '../../components/ui/Bits';
import { InspectionStatusBadge, ScoreBadge } from './shared';

/* ============ list ============ */
export function InspectionsList() {
  const { user } = useAuth();
  const perms = usePermissions(user?.id);
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'err' } | null>(null);
  const flash = (msg: string, tone: 'ok' | 'err' = 'ok') => { setToast({ msg, tone }); setTimeout(() => setToast(null), 3000); };

  const inspections = useQuery({
    queryKey: facilityKeys.inspections(),
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('inspections').select('*').is('deleted_at', null).order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      const propIds = [...new Set(rows.map((i) => i.property_id))];
      const { data: props } = propIds.length
        ? await supabase.from('properties').select('id, name').in('id', propIds)
        : { data: [] };
      return rows.map((i) => ({ ...i, property_name: props?.find((p) => p.id === i.property_id)?.name ?? '—' }));
    },
  });

  if (inspections.isLoading) return <PageSpinner />;

  return (
    <div className="space-y-4">
      {perms.can('facilities', 'create') && (
        <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> New inspection</Button>
      )}

      {(inspections.data?.length ?? 0) === 0 ? (
        <EmptyState title="No inspections yet" hint="Run a building inspection; scored items roll up to an overall score." />
      ) : (
        <Card>
          <CardBody className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-[#1C1C34]">
                  <th className="py-2 pr-4">Title</th>
                  <th className="py-2 pr-4">Property</th>
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Score</th>
                  <th className="py-2 pr-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {inspections.data!.map((i) => (
                  <tr key={i.id} className="border-b border-zinc-100 dark:border-[#1C1C34]/60">
                    <td className="py-2.5 pr-4">
                      <Link to={`/facilities/inspections/${i.id}`} className="font-medium text-brand hover:underline">{i.title}</Link>
                    </td>
                    <td className="py-2.5 pr-4">{i.property_name}</td>
                    <td className="py-2.5 pr-4 font-mono text-xs">{new Date(i.created_at).toLocaleDateString()}</td>
                    <td className="py-2.5 pr-4"><ScoreBadge score={i.overall_score} /></td>
                    <td className="py-2.5 pr-4"><InspectionStatusBadge status={i.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="New inspection">
        <CreateInspectionForm onDone={(m, t) => { setCreateOpen(false); flash(m, t); void qc.invalidateQueries({ queryKey: facilityKeys.inspections() }); }} />
      </Dialog>
      {toast && <Toast message={toast.msg} tone={toast.tone} />}
    </div>
  );
}

function CreateInspectionForm({ onDone }: { onDone: (m: string, t?: 'ok' | 'err') => void }) {
  const [propertyId, setPropertyId] = useState('');
  const [title, setTitle] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [pending, setPending] = useState(false);

  const properties = useQuery({
    queryKey: propertyKeys.list({ picker: 'inspection' }),
    queryFn: async () => {
      const { data, error } = await supabase.from('properties').select('id, name').is('deleted_at', null).order('name');
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const templates = useQuery({
    queryKey: [...facilityKeys.all, 'templates'],
    queryFn: async () => {
      const { data, error } = await supabase.from('inspection_templates').select('*').eq('active', true).is('deleted_at', null).order('name');
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const submit = async () => {
    if (!propertyId) return onDone('Pick a property', 'err');
    if (!title.trim()) return onDone('Give it a title', 'err');
    setPending(true);
    try {
      const { data: inspection, error } = await supabase
        .from('inspections')
        .insert({ property_id: propertyId, title: title.trim(), template_id: templateId || null, status: 'in_progress' })
        .select().single();
      if (error) throw new Error(error.message);

      // seed items from template
      if (templateId) {
        const tpl = templates.data?.find((t) => t.id === templateId);
        const items = (tpl?.items ?? []) as { label: string; category?: string }[];
        if (items.length) {
          const { error: itemErr } = await supabase.from('inspection_items').insert(
            items.map((it) => ({ inspection_id: inspection.id, label: it.label, category: it.category ?? null })),
          );
          if (itemErr) throw new Error(itemErr.message);
        }
      }
      await rpc.logActivity({ module: 'facilities', action: 'inspection_started', entityType: 'inspection', entityId: inspection.id });
      onDone('Inspection created');
    } catch (e) {
      onDone((e as Error).message, 'err');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-4">
      <Field label="Property">
        <Select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
          <option value="">Select…</option>
          {properties.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </Field>
      <Field label="Title"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Monthly building check" /></Field>
      <Field label="Template (optional)" hint="Pre-fills the checklist items.">
        <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
          <option value="">Blank — add items manually</option>
          {templates.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
      </Field>
      <div className="flex justify-end">
        <Button onClick={() => void submit()} disabled={pending}>{pending ? 'Creating…' : 'Create inspection'}</Button>
      </div>
    </div>
  );
}

/* ============ detail ============ */
export function InspectionDetail() {
  const id = useParams<{ id: string }>().id as string;
  const { user } = useAuth();
  const perms = usePermissions(user?.id);
  const qc = useQueryClient();
  const canEdit = perms.can('facilities', 'update');
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'err' } | null>(null);
  const flash = (msg: string, tone: 'ok' | 'err' = 'ok') => { setToast({ msg, tone }); setTimeout(() => setToast(null), 3000); };

  const inspection = useQuery({
    queryKey: facilityKeys.inspection(id),
    queryFn: async () => {
      const { data, error } = await supabase.from('inspections').select('*').eq('id', id).single();
      if (error) throw new Error(error.message);
      const [{ data: items }, { data: property }] = await Promise.all([
        supabase.from('inspection_items').select('*').eq('inspection_id', id).is('deleted_at', null).order('created_at'),
        supabase.from('properties').select('id, name').eq('id', data.property_id).single(),
      ]);
      return { ...data, items: items ?? [], property };
    },
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: facilityKeys.inspection(id) });
    void qc.invalidateQueries({ queryKey: facilityKeys.inspections() });
  };

  const scoreItem = useMutation({
    mutationFn: async ({ itemId, score }: { itemId: string; score: number }) => {
      // The DB trigger recomputes overall_score after each item change.
      const { error } = await supabase.from('inspection_items').update({ score }).eq('id', itemId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => refresh(),
    onError: (e) => flash((e as Error).message, 'err'),
  });

  const complete = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('inspections').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', id);
      if (error) throw new Error(error.message);
      await rpc.logActivity({ module: 'facilities', action: 'inspection_completed', entityType: 'inspection', entityId: id });
    },
    onSuccess: () => { refresh(); flash('Inspection completed and locked'); },
    onError: (e) => flash((e as Error).message, 'err'),
  });

  if (inspection.isLoading) return <PageSpinner />;
  if (!inspection.data) return <div className="p-6"><EmptyState title="Inspection not found" /></div>;
  const insp = inspection.data;
  const locked = insp.status === 'completed';
  const scoredCount = insp.items.filter((i) => i.score != null).length;

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-zinc-500">Inspection · {insp.property?.name}</p>
          <h1 className="mt-0.5 font-display text-xl font-semibold">{insp.title}</h1>
        </div>
        <InspectionStatusBadge status={insp.status} />
        <div className="ml-auto"><ScoreBadge score={insp.overall_score} /></div>
      </div>

      <Card className="mt-5">
        <CardHeader
          title="Checklist"
          subtitle={locked ? 'Completed — scores are locked.' : `${scoredCount} of ${insp.items.length} items scored. The overall score updates as you go.`}
          action={canEdit && !locked ? <Button variant="outline" onClick={() => setAddItemOpen(true)}><Plus className="h-4 w-4" /> Add item</Button> : undefined}
        />
        <CardBody>
          {insp.items.length === 0 ? (
            <EmptyState title="No items yet" hint="Add checklist items to score." />
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {insp.items.map((it) => (
                <li key={it.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{it.label}</p>
                    {it.category && <p className="text-xs text-zinc-400">{it.category}</p>}
                  </div>
                  {canEdit && !locked ? (
                    <div className="flex gap-1">
                      {[0, 1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          onClick={() => scoreItem.mutate({ itemId: it.id, score: n })}
                          className={`h-8 w-8 rounded-md border text-sm font-medium ${
                            it.score === n
                              ? 'border-brand bg-brand text-white'
                              : 'border-zinc-200 text-zinc-500 hover:border-brand hover:text-brand dark:border-[#1C1C34]'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <ScoreBadge score={it.score} />
                  )}
                </li>
              ))}
            </ul>
          )}

          {canEdit && !locked && insp.items.length > 0 && (
            <div className="mt-4 flex justify-end border-t border-zinc-200 pt-4 dark:border-[#1C1C34]">
              <Button onClick={() => complete.mutate()} disabled={complete.isPending}>
                {complete.isPending ? 'Completing…' : 'Complete & lock inspection'}
              </Button>
            </div>
          )}
        </CardBody>
      </Card>

      <Dialog open={addItemOpen} onClose={() => setAddItemOpen(false)} title="Add checklist item">
        <AddItemForm inspectionId={id} onDone={(m, t) => { setAddItemOpen(false); flash(m, t); refresh(); }} />
      </Dialog>
      {toast && <Toast message={toast.msg} tone={toast.tone} />}
    </div>
  );
}

function AddItemForm({ inspectionId, onDone }: { inspectionId: string; onDone: (m: string, t?: 'ok' | 'err') => void }) {
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState('');
  const [pending, setPending] = useState(false);

  const submit = async () => {
    if (!label.trim()) return onDone('Describe the item', 'err');
    setPending(true);
    const { error } = await supabase
      .from('inspection_items')
      .insert({ inspection_id: inspectionId, label: label.trim(), category: category.trim() || null });
    setPending(false);
    if (error) return onDone(error.message, 'err');
    onDone('Item added');
  };

  return (
    <div className="space-y-4">
      <Field label="What's being checked?"><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Fire extinguishers charged" /></Field>
      <Field label="Category (optional)"><Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. fire_safety" /></Field>
      <div className="flex justify-end">
        <Button onClick={() => void submit()} disabled={pending}>{pending ? 'Adding…' : 'Add item'}</Button>
      </div>
    </div>
  );
}
