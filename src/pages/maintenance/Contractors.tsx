import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Star } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { rpc } from '../../lib/rpc';
import { maintenanceKeys } from '../../api/keys';
import type { ContractorRow } from '../../lib/database.types';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { Card, CardBody } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Field, Input, Textarea } from '../../components/ui/Field';
import { Dialog } from '../../components/ui/Dialog';
import { Badge, EmptyState, PageSpinner, Toast } from '../../components/ui/Bits';
import { CATEGORIES } from './shared';

export function ContractorsPage() {
  const { user } = useAuth();
  const perms = usePermissions(user?.id);
  const qc = useQueryClient();
  const canEdit = perms.can('maintenance', 'update');
  const [editing, setEditing] = useState<ContractorRow | 'new' | null>(null);
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'err' } | null>(null);
  const flash = (msg: string, tone: 'ok' | 'err' = 'ok') => { setToast({ msg, tone }); setTimeout(() => setToast(null), 3000); };

  const contractors = useQuery({
    queryKey: maintenanceKeys.contractors(),
    queryFn: async () => {
      const { data, error } = await supabase.from('contractors').select('*').is('deleted_at', null).order('company_name');
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async ({ values, existing }: { values: ContractorFormValues; existing: ContractorRow | null }) => {
      const payload = {
        company_name: values.company_name, contact_person: values.contact_person || null,
        phone: values.phone || null, email: values.email || null,
        trades: values.trades, rating: values.rating ? Number(values.rating) : null, notes: values.notes || null,
      };
      if (existing) {
        const { error } = await supabase.from('contractors').update(payload).eq('id', existing.id);
        if (error) throw new Error(error.message);
        await rpc.logActivity({ module: 'maintenance', action: 'contractor_updated', entityType: 'contractor', entityId: existing.id });
      } else {
        const { data, error } = await supabase.from('contractors').insert(payload).select().single();
        if (error) throw new Error(error.message);
        await rpc.logActivity({ module: 'maintenance', action: 'contractor_added', entityType: 'contractor', entityId: data.id });
      }
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: maintenanceKeys.contractors() }); setEditing(null); flash('Contractor saved'); },
    onError: (e) => flash((e as Error).message, 'err'),
  });

  if (contractors.isLoading) return <PageSpinner />;

  return (
    <div className="space-y-4">
      {canEdit && (
        <Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> Add contractor</Button>
      )}
      {(contractors.data?.length ?? 0) === 0 ? (
        <EmptyState title="No contractors yet" hint="Add the vendors you dispatch to work orders." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {contractors.data!.map((c) => (
            <Card key={c.id}>
              <CardBody>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{c.company_name}</p>
                    {c.contact_person && <p className="truncate text-sm text-zinc-500">{c.contact_person}</p>}
                  </div>
                  {c.rating != null && (
                    <span className="flex items-center gap-1 text-sm">
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> {c.rating}
                    </span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {(c.trades ?? []).map((t) => <Badge key={t} tone="zinc">{t}</Badge>)}
                </div>
                {(c.phone || c.email) && (
                  <p className="mt-2 text-xs text-zinc-500">{[c.phone, c.email].filter(Boolean).join(' · ')}</p>
                )}
                {canEdit && (
                  <button className="mt-2 text-sm font-medium text-brand hover:underline" onClick={() => setEditing(c)}>Edit</button>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add contractor' : 'Edit contractor'}>
        {editing !== null && (
          <ContractorForm
            existing={editing === 'new' ? null : editing}
            pending={save.isPending}
            onSubmit={(values) => save.mutate({ values, existing: editing === 'new' ? null : editing })}
          />
        )}
      </Dialog>
      {toast && <Toast message={toast.msg} tone={toast.tone} />}
    </div>
  );
}

interface ContractorFormValues {
  company_name: string;
  contact_person: string;
  phone: string;
  email: string;
  trades: string[];
  rating: string;
  notes: string;
}

function ContractorForm({ existing, onSubmit, pending }: { existing: ContractorRow | null; onSubmit: (v: ContractorFormValues) => void; pending: boolean }) {
  const [v, setV] = useState<ContractorFormValues>({
    company_name: existing?.company_name ?? '',
    contact_person: existing?.contact_person ?? '',
    phone: existing?.phone ?? '',
    email: existing?.email ?? '',
    trades: existing?.trades ?? [],
    rating: existing?.rating != null ? String(existing.rating) : '',
    notes: existing?.notes ?? '',
  });
  const set = (k: keyof ContractorFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setV((s) => ({ ...s, [k]: e.target.value }));
  const toggleTrade = (t: string) =>
    setV((s) => ({ ...s, trades: s.trades.includes(t) ? s.trades.filter((x) => x !== t) : [...s.trades, t] }));

  return (
    <div className="space-y-4">
      <Field label="Company name"><Input value={v.company_name} onChange={set('company_name')} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Contact person"><Input value={v.contact_person} onChange={set('contact_person')} /></Field>
        <Field label="Rating (0–5)"><Input type="number" min={0} max={5} step="0.1" value={v.rating} onChange={set('rating')} /></Field>
        <Field label="Phone"><Input value={v.phone} onChange={set('phone')} /></Field>
        <Field label="Email"><Input type="email" value={v.email} onChange={set('email')} /></Field>
      </div>
      <div>
        <p className="mb-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300">Trades</p>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => toggleTrade(t)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                v.trades.includes(t) ? 'border-brand bg-brand/10 text-brand' : 'border-zinc-200 text-zinc-600 dark:border-zinc-800 dark:text-zinc-400'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <Field label="Notes"><Textarea rows={2} value={v.notes} onChange={set('notes')} /></Field>
      <div className="flex justify-end">
        <Button onClick={() => v.company_name.trim() && onSubmit(v)} disabled={pending || !v.company_name.trim()}>
          {pending ? 'Saving…' : 'Save contractor'}
        </Button>
      </div>
    </div>
  );
}
