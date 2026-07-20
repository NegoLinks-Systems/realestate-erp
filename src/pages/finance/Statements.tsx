import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { rpc } from '../../lib/rpc';
import { financeKeys } from '../../api/keys';
import type { PaymentMethod } from '../../lib/database.types';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { useBranding, useMoney } from '../../providers/BrandingProvider';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Field, Input, Select } from '../../components/ui/Field';
import { Dialog } from '../../components/ui/Dialog';
import { Badge, EmptyState, PageSpinner, Toast } from '../../components/ui/Bits';

/* ============ staff-facing: generate + list all statements ============ */
export function StatementsPage() {
  const { user } = useAuth();
  const perms = usePermissions(user?.id);
  const qc = useQueryClient();
  const money = useMoney();
  const [genOpen, setGenOpen] = useState(false);
  const [disburseFor, setDisburseFor] = useState<{ id: string; net: number } | null>(null);
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'err' } | null>(null);
  const flash = (msg: string, tone: 'ok' | 'err' = 'ok') => { setToast({ msg, tone }); setTimeout(() => setToast(null), 4000); };

  const statements = useQuery({
    queryKey: financeKeys.statements(),
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('landlord_statements').select('*').is('deleted_at', null).order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      const landlordIds = [...new Set(rows.map((s) => s.landlord_id))];
      const { data: landlords } = landlordIds.length
        ? await supabase.from('landlords').select('id, full_name').in('id', landlordIds)
        : { data: [] };
      return rows.map((s) => ({ ...s, landlord_name: landlords?.find((l) => l.id === s.landlord_id)?.full_name ?? '—' }));
    },
  });

  if (statements.isLoading) return <PageSpinner />;

  return (
    <div className="space-y-4">
      {perms.can('finance', 'create') && (
        <Button onClick={() => setGenOpen(true)}><Plus className="h-4 w-4" /> Generate statement</Button>
      )}

      {(statements.data?.length ?? 0) === 0 ? (
        <EmptyState
          title="No statements yet"
          hint="Generate one for a landlord over a period — gross rent collected, less management fee and property expenses, equals net due."
        />
      ) : (
        <Card>
          <CardBody className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-[#1C1C34]">
                  <th className="py-2 pr-4">Landlord</th>
                  <th className="py-2 pr-4">Period</th>
                  <th className="py-2 pr-4">Gross</th>
                  <th className="py-2 pr-4">Fee</th>
                  <th className="py-2 pr-4">Expenses</th>
                  <th className="py-2 pr-4">Net due</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {statements.data!.map((s) => (
                  <tr key={s.id} className="border-b border-zinc-100 dark:border-[#1C1C34]/60">
                    <td className="py-2.5 pr-4 font-medium">{s.landlord_name}</td>
                    <td className="py-2.5 pr-4 font-mono text-xs">{s.period_start} → {s.period_end}</td>
                    <td className="py-2.5 pr-4 tabular-nums">{money(Number(s.gross_collected))}</td>
                    <td className="py-2.5 pr-4 tabular-nums text-zinc-500">-{money(Number(s.management_fee))}</td>
                    <td className="py-2.5 pr-4 tabular-nums text-zinc-500">-{money(Number(s.expenses_total))}</td>
                    <td className="py-2.5 pr-4 tabular-nums font-semibold text-brand">{money(Number(s.net_due))}</td>
                    <td className="py-2.5 pr-4">
                      <Badge tone={s.status === 'disbursed' ? 'green' : 'amber'}>{s.status}</Badge>
                    </td>
                    <td className="py-2.5 text-right">
                      {perms.can('finance', 'update') && s.status !== 'disbursed' && Number(s.net_due) > 0 && (
                        <button className="text-sm font-medium text-brand hover:underline"
                          onClick={() => setDisburseFor({ id: s.id, net: Number(s.net_due) })}>
                          Record disbursement
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}

      <Dialog open={genOpen} onClose={() => setGenOpen(false)} title="Generate landlord statement">
        <GenerateForm onDone={(m, t) => { setGenOpen(false); flash(m, t); void qc.invalidateQueries({ queryKey: financeKeys.statements() }); }} />
      </Dialog>

      <Dialog open={disburseFor !== null} onClose={() => setDisburseFor(null)} title="Record disbursement">
        {disburseFor && (
          <DisburseForm
            statementId={disburseFor.id}
            net={disburseFor.net}
            onDone={(m, t) => { setDisburseFor(null); flash(m, t); void qc.invalidateQueries({ queryKey: financeKeys.statements() }); }}
          />
        )}
      </Dialog>
      {toast && <Toast message={toast.msg} tone={toast.tone} />}
    </div>
  );
}

function GenerateForm({ onDone }: { onDone: (m: string, t?: 'ok' | 'err') => void }) {
  const firstOfMonth = new Date();
  firstOfMonth.setDate(1);
  const [landlordId, setLandlordId] = useState('');
  const [start, setStart] = useState(firstOfMonth.toISOString().slice(0, 10));
  const [end, setEnd] = useState(new Date().toISOString().slice(0, 10));
  const [pending, setPending] = useState(false);

  const landlords = useQuery({
    queryKey: ['statement-landlord-picker'],
    queryFn: async () => {
      const { data, error } = await supabase.from('landlords').select('id, full_name').is('deleted_at', null).order('full_name');
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const submit = async () => {
    if (!landlordId) return onDone('Choose a landlord', 'err');
    if (end < start) return onDone('End date must be on or after start date', 'err');
    setPending(true);
    try {
      const statementId = await rpc.generateLandlordStatement(landlordId, start, end);
      await rpc.logActivity({ module: 'finance', action: 'statement_generated', entityType: 'landlord_statement', entityId: statementId });
      onDone('Statement generated');
    } catch (e) {
      onDone((e as Error).message, 'err');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-4">
      <Field label="Landlord">
        <Select value={landlordId} onChange={(e) => setLandlordId(e.target.value)}>
          <option value="">Select…</option>
          {landlords.data?.map((l) => <option key={l.id} value={l.id}>{l.full_name}</option>)}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Period start"><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="Period end"><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
      </div>
      <p className="text-xs text-zinc-500">
        Computed from rent actually collected in the period on this landlord's properties, less their management fee and property expenses.
      </p>
      <div className="flex justify-end">
        <Button onClick={() => void submit()} disabled={pending}>{pending ? 'Generating…' : 'Generate'}</Button>
      </div>
    </div>
  );
}

function DisburseForm({ statementId, net, onDone }: { statementId: string; net: number; onDone: (m: string, t?: 'ok' | 'err') => void }) {
  const money = useMoney();
  const [method, setMethod] = useState<PaymentMethod>('bank_transfer');
  const [reference, setReference] = useState('');
  const [pending, setPending] = useState(false);

  const submit = async () => {
    setPending(true);
    try {
      const { data, error } = await supabase
        .from('disbursements')
        .insert({ statement_id: statementId, amount: net, method, reference: reference.trim() || null, disbursed_at: new Date().toISOString() })
        .select().single();
      if (error) throw new Error(error.message);
      const { error: updErr } = await supabase.from('landlord_statements').update({ status: 'disbursed' }).eq('id', statementId);
      if (updErr) throw new Error(updErr.message);
      await rpc.logActivity({ module: 'finance', action: 'disbursement_recorded', entityType: 'disbursement', entityId: data.id, after: { amount: net } as never });
      onDone('Disbursement recorded — statement marked paid');
    } catch (e) {
      onDone((e as Error).message, 'err');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="rounded-md bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-800/60">
        Net to disburse: <span className="font-semibold tabular-nums">{money(net)}</span>
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Method">
          <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            <option value="bank_transfer">Bank transfer</option>
            <option value="cash">Cash</option>
            <option value="cheque">Cheque</option>
            <option value="online">Online</option>
          </Select>
        </Field>
        <Field label="Reference"><Input value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
      </div>
      <div className="flex justify-end">
        <Button onClick={() => void submit()} disabled={pending}>{pending ? 'Recording…' : 'Record disbursement'}</Button>
      </div>
    </div>
  );
}

/* ============ landlord-facing: read-only own statements ============ */
export function MyStatementsPage() {
  const { organizationName } = useBranding();
  const money = useMoney();

  const statements = useQuery({
    queryKey: financeKeys.statements('self'),
    queryFn: async () => {
      // RLS restricts to the signed-in landlord's own rows.
      const { data, error } = await supabase
        .from('landlord_statements').select('*').is('deleted_at', null).order('period_end', { ascending: false });
      if (error) throw new Error(error.message);
      return data;
    },
  });

  if (statements.isLoading) return <PageSpinner />;

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <p className="text-[11px] uppercase tracking-widest text-zinc-500">{organizationName}</p>
      <h1 className="mt-0.5 font-display text-xl font-semibold">My statements</h1>
      <p className="mt-1 text-sm text-zinc-500">Rent collected on your properties, less fees and expenses.</p>

      <div className="mt-5 space-y-3">
        {(statements.data?.length ?? 0) === 0 ? (
          <EmptyState title="No statements yet" hint="Statements appear here once the management office generates them." />
        ) : (
          statements.data!.map((s) => (
            <Card key={s.id}>
              <CardHeader
                title={`${s.period_start} → ${s.period_end}`}
                subtitle={s.status === 'disbursed' ? 'Paid out' : 'Awaiting disbursement'}
                action={<Badge tone={s.status === 'disbursed' ? 'green' : 'amber'}>{s.status}</Badge>}
              />
              <CardBody>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                  <Line label="Gross collected" value={money(Number(s.gross_collected))} />
                  <Line label="Management fee" value={`-${money(Number(s.management_fee))}`} muted />
                  <Line label="Expenses" value={`-${money(Number(s.expenses_total))}`} muted />
                  <Line label="Net to you" value={money(Number(s.net_due))} accent />
                </dl>
              </CardBody>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

function Line({ label, value, muted = false, accent = false }: { label: string; value: string; muted?: boolean; accent?: boolean }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className={`mt-0.5 tabular-nums ${accent ? 'font-display text-lg font-semibold text-brand' : muted ? 'text-zinc-500' : 'font-medium'}`}>{value}</dd>
    </div>
  );
}

