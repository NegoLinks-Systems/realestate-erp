import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DoorOpen, LogIn, LogOut, Plus, ScanLine, Ban } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { rpc } from '../../lib/rpc';
import { propertyKeys, visitorKeys } from '../../api/keys';
import type { PassStatus } from '../../lib/database.types';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Field, Input, Select, Textarea } from '../../components/ui/Field';
import { Dialog } from '../../components/ui/Dialog';
import { Badge, EmptyState, PageSpinner, Toast } from '../../components/ui/Bits';

function PassStatusBadge({ status }: { status: PassStatus }) {
  const tone =
    status === 'checked_in' ? 'green'
    : status === 'pending' ? 'amber'
    : status === 'checked_out' ? 'brand'
    : status === 'revoked' ? 'red'
    : 'zinc';
  return <Badge tone={tone as 'green' | 'amber' | 'brand' | 'red' | 'zinc'}>{status.replace('_', ' ')}</Badge>;
}

export default function VisitorsPage() {
  const { user } = useAuth();
  const perms = usePermissions(user?.id);
  const qc = useQueryClient();
  const canOperate = perms.can('visitors', 'update');
  const canCreate = perms.can('visitors', 'create');
  const [statusFilter, setStatusFilter] = useState<'' | PassStatus>('');
  const [gateOpen, setGateOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'err' } | null>(null);
  const flash = (msg: string, tone: 'ok' | 'err' = 'ok') => { setToast({ msg, tone }); setTimeout(() => setToast(null), 4000); };

  const passes = useQuery({
    queryKey: visitorKeys.passes(),
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('visitor_passes').select('*').is('deleted_at', null).order('created_at', { ascending: false }).limit(100);
      if (error) throw new Error(error.message);
      const visitorIds = [...new Set(rows.map((p) => p.visitor_id))];
      const propIds = [...new Set(rows.map((p) => p.property_id))];
      const [visitors, props] = await Promise.all([
        visitorIds.length ? supabase.from('visitors').select('id, full_name, phone').in('id', visitorIds) : Promise.resolve({ data: [] }),
        propIds.length ? supabase.from('properties').select('id, name').in('id', propIds) : Promise.resolve({ data: [] }),
      ]);
      return rows.map((p) => ({
        ...p,
        visitor: visitors.data?.find((v) => v.id === p.visitor_id) ?? null,
        property_name: props.data?.find((x) => x.id === p.property_id)?.name ?? '—',
      }));
    },
  });

  const checkOut = useMutation({
    mutationFn: async (token: string) => {
      await rpc.checkOutPass(token);
      await rpc.logActivity({ module: 'visitors', action: 'checked_out', entityType: 'visitor_pass', entityId: token });
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: visitorKeys.passes() }); flash('Checked out'); },
    onError: (e) => flash((e as Error).message, 'err'),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('visitor_passes').update({ status: 'revoked', revoked_reason: 'Revoked by staff' }).eq('id', id);
      if (error) throw new Error(error.message);
      await rpc.logActivity({ module: 'visitors', action: 'pass_revoked', entityType: 'visitor_pass', entityId: id });
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: visitorKeys.passes() }); flash('Pass revoked'); },
    onError: (e) => flash((e as Error).message, 'err'),
  });

  const rows = useMemo(() => {
    const list = passes.data ?? [];
    return statusFilter ? list.filter((p) => p.status === statusFilter) : list;
  }, [passes.data, statusFilter]);

  if (passes.isLoading) return <PageSpinner />;
  const checkedInCount = (passes.data ?? []).filter((p) => p.status === 'checked_in').length;

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold">Visitors</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            {checkedInCount} currently on-site
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          {canOperate && <Button variant="outline" onClick={() => setGateOpen(true)}><ScanLine className="h-4 w-4" /> Gate check-in</Button>}
          {canCreate && <Button onClick={() => setIssueOpen(true)}><Plus className="h-4 w-4" /> Issue pass</Button>}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as '' | PassStatus)} className="w-44">
          <option value="">All statuses</option>
          {(['pending', 'checked_in', 'checked_out', 'expired', 'revoked'] as PassStatus[]).map((s) => (
            <option key={s} value={s}>{s.replace('_', ' ')}</option>
          ))}
        </Select>
        <span className="text-sm text-zinc-500">{rows.length} passes</span>
      </div>

      <div className="mt-4">
        {rows.length === 0 ? (
          <EmptyState title={passes.data?.length ? 'No passes in this status' : 'No visitor passes yet'} hint="Issue a pass; the visitor is checked in at the gate by its QR token." />
        ) : (
          <Card>
            <CardBody className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
                    <th className="py-2 pr-4">Visitor</th>
                    <th className="py-2 pr-4">Property</th>
                    <th className="py-2 pr-4">Valid until</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id} className="border-b border-zinc-100 dark:border-zinc-800/60">
                      <td className="py-2.5 pr-4">
                        <span className="font-medium">{p.visitor?.full_name ?? '—'}</span>
                        {p.visitor?.phone && <span className="ml-1 text-xs text-zinc-400">{p.visitor.phone}</span>}
                      </td>
                      <td className="py-2.5 pr-4">{p.property_name}</td>
                      <td className="py-2.5 pr-4 font-mono text-xs">{new Date(p.valid_to).toLocaleString()}</td>
                      <td className="py-2.5 pr-4"><PassStatusBadge status={p.status} /></td>
                      <td className="py-2.5 text-right">
                        {canOperate && p.status === 'checked_in' && (
                          <button onClick={() => checkOut.mutate(p.qr_token)} className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">
                            <LogOut className="h-3.5 w-3.5" /> Check out
                          </button>
                        )}
                        {canOperate && p.status === 'pending' && (
                          <button onClick={() => revoke.mutate(p.id)} className="inline-flex items-center gap-1 text-sm font-medium text-zinc-500 hover:text-red-600">
                            <Ban className="h-3.5 w-3.5" /> Revoke
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
      </div>

      <Dialog open={gateOpen} onClose={() => setGateOpen(false)} title="Gate check-in">
        <GateForm onDone={(m, t) => { flash(m, t); void qc.invalidateQueries({ queryKey: visitorKeys.passes() }); if (t !== 'err') setGateOpen(false); }} />
      </Dialog>

      <Dialog open={issueOpen} onClose={() => setIssueOpen(false)} title="Issue visitor pass">
        <IssuePassForm hostUserId={user!.id} onDone={(m, t) => { setIssueOpen(false); flash(m, t); void qc.invalidateQueries({ queryKey: visitorKeys.passes() }); }} />
      </Dialog>
      {toast && <Toast message={toast.msg} tone={toast.tone} />}
    </div>
  );
}

function GateForm({ onDone }: { onDone: (m: string, t?: 'ok' | 'err') => void }) {
  const [token, setToken] = useState('');
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);

  const submit = async () => {
    if (!token.trim()) return onDone('Enter the pass token', 'err');
    setPending(true);
    try {
      await rpc.checkInPass(token.trim(), note.trim() || undefined);
      await rpc.logActivity({ module: 'visitors', action: 'checked_in', entityType: 'visitor_pass', entityId: token.trim() });
      onDone('Visitor checked in — host notified');
    } catch (e) {
      onDone((e as Error).message, 'err');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-md bg-zinc-50 px-3 py-2 text-sm text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-300">
        <DoorOpen className="h-4 w-4" /> Scan or paste the visitor's QR token to admit them.
      </div>
      <Field label="Pass token"><Input value={token} onChange={(e) => setToken(e.target.value)} placeholder="QR token" className="font-mono" /></Field>
      <Field label="Gate note (optional)"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <div className="flex justify-end">
        <Button onClick={() => void submit()} disabled={pending}><LogIn className="h-4 w-4" /> {pending ? 'Checking in…' : 'Check in'}</Button>
      </div>
    </div>
  );
}

function IssuePassForm({ hostUserId, onDone }: { hostUserId: string; onDone: (m: string, t?: 'ok' | 'err') => void }) {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [purpose, setPurpose] = useState('');
  const [hours, setHours] = useState('8');
  const [pending, setPending] = useState(false);

  const properties = useQuery({
    queryKey: propertyKeys.list({ picker: 'visitor' }),
    queryFn: async () => {
      const { data, error } = await supabase.from('properties').select('id, name').is('deleted_at', null).order('name');
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const submit = async () => {
    if (!fullName.trim()) return onDone('Enter the visitor name', 'err');
    if (!propertyId) return onDone('Pick a property', 'err');
    setPending(true);
    try {
      const { data: visitor, error: vErr } = await supabase
        .from('visitors').insert({ full_name: fullName.trim(), phone: phone.trim() || null }).select().single();
      if (vErr) throw new Error(vErr.message);
      const validTo = new Date(Date.now() + (Number(hours) || 8) * 3600000).toISOString();
      const { data: pass, error: pErr } = await supabase
        .from('visitor_passes')
        .insert({ visitor_id: visitor.id, host_user_id: hostUserId, property_id: propertyId, purpose: purpose.trim() || null, valid_to: validTo })
        .select().single();
      if (pErr) throw new Error(pErr.message);
      await rpc.logActivity({ module: 'visitors', action: 'pass_issued', entityType: 'visitor_pass', entityId: pass.id });
      onDone(`Pass issued — token ${pass.qr_token.slice(0, 8)}…`);
    } catch (e) {
      onDone((e as Error).message, 'err');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Visitor name"><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></Field>
        <Field label="Phone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
      </div>
      <Field label="Property">
        <Select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
          <option value="">Select…</option>
          {properties.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Purpose (optional)"><Input value={purpose} onChange={(e) => setPurpose(e.target.value)} /></Field>
        <Field label="Valid for (hours)"><Input type="number" min={1} max={168} value={hours} onChange={(e) => setHours(e.target.value)} /></Field>
      </div>
      <p className="text-xs text-zinc-500">A QR token is generated automatically. The gate admits the visitor by that token.</p>
      <div className="flex justify-end">
        <Button onClick={() => void submit()} disabled={pending}>{pending ? 'Issuing…' : 'Issue pass'}</Button>
      </div>
    </div>
  );
}
