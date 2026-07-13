import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { rpc } from '../../lib/rpc';
import { procurementKeys } from '../../api/keys';
import type { VendorRow } from '../../lib/database.types';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { Card, CardBody } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Field, Input, Textarea } from '../../components/ui/Field';
import { Dialog } from '../../components/ui/Dialog';
import { Badge, EmptyState, PageSpinner, Toast } from '../../components/ui/Bits';

export function VendorsPage() {
  const { user } = useAuth();
  const perms = usePermissions(user?.id);
  const qc = useQueryClient();
  const canEdit = perms.can('procurement', 'update');
  const [editing, setEditing] = useState<VendorRow | 'new' | null>(null);
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'err' } | null>(null);
  const flash = (msg: string, tone: 'ok' | 'err' = 'ok') => { setToast({ msg, tone }); setTimeout(() => setToast(null), 3000); };

  const vendors = useQuery({
    queryKey: procurementKeys.vendors(),
    queryFn: async () => {
      const { data, error } = await supabase.from('vendors').select('*').is('deleted_at', null).order('company_name');
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async ({ values, existing }: { values: VendorFormValues; existing: VendorRow | null }) => {
      const categories = values.categories.split(',').map((c) => c.trim()).filter(Boolean);
      const bank = { account_name: values.account_name || null, account_number: values.account_number || null, bank_name: values.bank_name || null };
      const payload = {
        company_name: values.company_name, contact_person: values.contact_person || null,
        phone: values.phone || null, email: values.email || null,
        categories, bank_details: bank, notes: values.notes || null,
      };
      if (existing) {
        const { error } = await supabase.from('vendors').update(payload).eq('id', existing.id);
        if (error) throw new Error(error.message);
        await rpc.logActivity({ module: 'procurement', action: 'vendor_updated', entityType: 'vendor', entityId: existing.id });
      } else {
        const { data, error } = await supabase.from('vendors').insert(payload).select().single();
        if (error) throw new Error(error.message);
        await rpc.logActivity({ module: 'procurement', action: 'vendor_added', entityType: 'vendor', entityId: data.id });
      }
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: procurementKeys.vendors() }); setEditing(null); flash('Vendor saved'); },
    onError: (e) => flash((e as Error).message, 'err'),
  });

  if (vendors.isLoading) return <PageSpinner />;

  return (
    <div className="space-y-4">
      {canEdit && <Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> Add vendor</Button>}
      {(vendors.data?.length ?? 0) === 0 ? (
        <EmptyState title="No vendors yet" hint="Add suppliers you raise purchase orders against." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {vendors.data!.map((v) => (
            <Card key={v.id}>
              <CardBody>
                <p className="font-medium">{v.company_name}</p>
                {v.contact_person && <p className="text-sm text-zinc-500">{v.contact_person}</p>}
                <div className="mt-2 flex flex-wrap gap-1">
                  {(v.categories ?? []).map((c) => <Badge key={c} tone="zinc">{c}</Badge>)}
                </div>
                {(v.phone || v.email) && <p className="mt-2 text-xs text-zinc-500">{[v.phone, v.email].filter(Boolean).join(' · ')}</p>}
                {canEdit && <button className="mt-2 text-sm font-medium text-brand hover:underline" onClick={() => setEditing(v)}>Edit</button>}
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add vendor' : 'Edit vendor'}>
        {editing !== null && (
          <VendorForm existing={editing === 'new' ? null : editing} pending={save.isPending} onSubmit={(values) => save.mutate({ values, existing: editing === 'new' ? null : editing })} />
        )}
      </Dialog>
      {toast && <Toast message={toast.msg} tone={toast.tone} />}
    </div>
  );
}

interface VendorFormValues {
  company_name: string; contact_person: string; phone: string; email: string;
  categories: string; account_name: string; account_number: string; bank_name: string; notes: string;
}

function VendorForm({ existing, onSubmit, pending }: { existing: VendorRow | null; onSubmit: (v: VendorFormValues) => void; pending: boolean }) {
  const bank = (existing?.bank_details ?? {}) as Record<string, string | null>;
  const [v, setV] = useState<VendorFormValues>({
    company_name: existing?.company_name ?? '',
    contact_person: existing?.contact_person ?? '',
    phone: existing?.phone ?? '',
    email: existing?.email ?? '',
    categories: (existing?.categories ?? []).join(', '),
    account_name: bank.account_name ?? '',
    account_number: bank.account_number ?? '',
    bank_name: bank.bank_name ?? '',
    notes: existing?.notes ?? '',
  });
  const set = (k: keyof VendorFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setV((s) => ({ ...s, [k]: e.target.value }));

  return (
    <div className="space-y-4">
      <Field label="Company name"><Input value={v.company_name} onChange={set('company_name')} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Contact person"><Input value={v.contact_person} onChange={set('contact_person')} /></Field>
        <Field label="Categories" hint="Comma-separated"><Input value={v.categories} onChange={set('categories')} placeholder="plumbing, electrical" /></Field>
        <Field label="Phone"><Input value={v.phone} onChange={set('phone')} /></Field>
        <Field label="Email"><Input type="email" value={v.email} onChange={set('email')} /></Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Account name"><Input value={v.account_name} onChange={set('account_name')} /></Field>
        <Field label="Account number"><Input value={v.account_number} onChange={set('account_number')} /></Field>
        <Field label="Bank"><Input value={v.bank_name} onChange={set('bank_name')} /></Field>
      </div>
      <Field label="Notes"><Textarea rows={2} value={v.notes} onChange={set('notes')} /></Field>
      <div className="flex justify-end">
        <Button onClick={() => v.company_name.trim() && onSubmit(v)} disabled={pending || !v.company_name.trim()}>{pending ? 'Saving…' : 'Save vendor'}</Button>
      </div>
    </div>
  );
}
