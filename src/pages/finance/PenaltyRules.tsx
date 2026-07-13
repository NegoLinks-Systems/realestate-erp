import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { rpc } from '../../lib/rpc';
import { financeKeys, propertyKeys } from '../../api/keys';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { useMoney } from '../../providers/BrandingProvider';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Field, Input, Select } from '../../components/ui/Field';
import { Dialog } from '../../components/ui/Dialog';
import { Badge, EmptyState, PageSpinner, Toast } from '../../components/ui/Bits';

export function PenaltyRulesPage() {
  const { user } = useAuth();
  const perms = usePermissions(user?.id);
  const qc = useQueryClient();
  const money = useMoney();
  const canEdit = perms.can('finance', 'update');
  const [addOpen, setAddOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'err' } | null>(null);
  const flash = (msg: string, tone: 'ok' | 'err' = 'ok') => { setToast({ msg, tone }); setTimeout(() => setToast(null), 3000); };

  const rules = useQuery({
    queryKey: financeKeys.penaltyRules(),
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('penalty_rules').select('*').is('deleted_at', null).order('created_at');
      if (error) throw new Error(error.message);
      const propIds = rows.filter((r) => r.property_id).map((r) => r.property_id!) as string[];
      const { data: props } = propIds.length
        ? await supabase.from('properties').select('id, name').in('id', propIds)
        : { data: [] };
      return rows.map((r) => ({ ...r, property_name: r.property_id ? props?.find((p) => p.id === r.property_id)?.name ?? '—' : 'All properties (default)' }));
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('penalty_rules').update({ deleted_at: new Date().toISOString() }).eq('id', id);
      if (error) throw new Error(error.message);
      await rpc.logActivity({ module: 'finance', action: 'penalty_rule_removed', entityType: 'penalty_rule', entityId: id });
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: financeKeys.penaltyRules() }); flash('Rule removed'); },
    onError: (e) => flash((e as Error).message, 'err'),
  });

  if (rules.isLoading) return <PageSpinner />;

  return (
    <Card>
      <CardHeader
        title="Penalty rules"
        subtitle="Late-payment fees applied by the nightly job (or the Overview 'Apply penalties' button). A property-specific rule overrides the default."
        action={canEdit ? <Button variant="outline" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add rule</Button> : undefined}
      />
      <CardBody>
        {(rules.data?.length ?? 0) === 0 ? (
          <EmptyState title="No penalty rules" hint="Without a rule, overdue invoices accrue no late fee." />
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {rules.data!.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{r.name}</p>
                  <p className="text-xs text-zinc-500">{r.property_name}</p>
                </div>
                <Badge tone="zinc">{r.grace_days}d grace</Badge>
                <Badge tone="amber">{r.percent != null ? `${r.percent}%` : money(Number(r.flat_amount))}</Badge>
                {!r.active && <Badge tone="zinc">inactive</Badge>}
                {canEdit && (
                  <button aria-label="Remove" onClick={() => remove.mutate(r.id)} className="ml-auto rounded p-1 text-zinc-400 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardBody>

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} title="Add penalty rule">
        <RuleForm onDone={(m, t) => { setAddOpen(false); flash(m, t); void qc.invalidateQueries({ queryKey: financeKeys.penaltyRules() }); }} />
      </Dialog>
      {toast && <Toast message={toast.msg} tone={toast.tone} />}
    </Card>
  );
}

function RuleForm({ onDone }: { onDone: (m: string, t?: 'ok' | 'err') => void }) {
  const [name, setName] = useState('Late payment fee');
  const [propertyId, setPropertyId] = useState('');
  const [grace, setGrace] = useState('7');
  const [mode, setMode] = useState<'percent' | 'flat'>('percent');
  const [value, setValue] = useState('5');
  const [pending, setPending] = useState(false);

  const properties = useQuery({
    queryKey: propertyKeys.list({ picker: 'penalty' }),
    queryFn: async () => {
      const { data, error } = await supabase.from('properties').select('id, name').is('deleted_at', null).order('name');
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const submit = async () => {
    if (!name.trim()) return onDone('Name the rule', 'err');
    const v = Number(value);
    if (!(v > 0)) return onDone('Enter a value greater than zero', 'err');
    setPending(true);
    const payload = {
      name: name.trim(),
      property_id: propertyId || null,
      grace_days: Number(grace) || 0,
      percent: mode === 'percent' ? v : null,
      flat_amount: mode === 'flat' ? v : null,
      active: true,
    };
    const { data, error } = await supabase.from('penalty_rules').insert(payload).select().single();
    setPending(false);
    if (error) return onDone(error.message, 'err');
    await rpc.logActivity({ module: 'finance', action: 'penalty_rule_added', entityType: 'penalty_rule', entityId: data.id });
    onDone('Penalty rule added');
  };

  return (
    <div className="space-y-4">
      <Field label="Rule name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Applies to" hint="A property-specific rule overrides the default for that property.">
        <Select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
          <option value="">All properties (default)</option>
          {properties.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Grace days"><Input type="number" min={0} value={grace} onChange={(e) => setGrace(e.target.value)} /></Field>
        <Field label="Fee type">
          <Select value={mode} onChange={(e) => setMode(e.target.value as 'percent' | 'flat')}>
            <option value="percent">Percent</option>
            <option value="flat">Flat amount</option>
          </Select>
        </Field>
        <Field label={mode === 'percent' ? 'Percent' : 'Amount'}><Input type="number" min={0} step="0.01" value={value} onChange={(e) => setValue(e.target.value)} /></Field>
      </div>
      <div className="flex justify-end">
        <Button onClick={() => void submit()} disabled={pending}>{pending ? 'Saving…' : 'Add rule'}</Button>
      </div>
    </div>
  );
}
