import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { rpc } from '../../lib/rpc';
import type { MaintenanceCategory, RequestPriority } from '../../lib/database.types';
import { portalKeys } from '../../api/keys';
import { useBranding, useMoney } from '../../providers/BrandingProvider';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Field, Input, Select, Textarea } from '../../components/ui/Field';
import { Dialog } from '../../components/ui/Dialog';
import { Badge, EmptyState, PageSpinner, Toast } from '../../components/ui/Bits';
import { LeaseStatusBadge } from '../leases/shared';
import { ComplaintBadge } from '../tenants/TenantDetail';

export default function TenantPortal() {
  const { organizationName } = useBranding();
  const money = useMoney();
  const qc = useQueryClient();
  const [complaintOpen, setComplaintOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'err' } | null>(null);
  const flash = (msg: string, tone: 'ok' | 'err' = 'ok') => { setToast({ msg, tone }); setTimeout(() => setToast(null), 3000); };

  // RLS scopes every query below to the signed-in tenant automatically.
  const home = useQuery({
    queryKey: portalKeys.lease(),
    queryFn: async () => {
      const { data: me, error: meErr } = await supabase.from('tenants').select('*').limit(1);
      if (meErr) throw new Error(meErr.message);
      const tenant = me?.[0] ?? null;
      if (!tenant) return { tenant: null, lease: null, unit: null };
      const { data: leases } = await supabase
        .from('leases').select('*').is('deleted_at', null)
        .in('status', ['active', 'expiring']).order('end_date', { ascending: false }).limit(1);
      const lease = leases?.[0] ?? null;
      const unit = lease
        ? (await supabase.from('units').select('id, unit_number, property_id').eq('id', lease.unit_id).single()).data
        : null;
      return { tenant, lease, unit };
    },
  });

  const documents = useQuery({
    queryKey: portalKeys.documents(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenant_documents').select('*').is('deleted_at', null).order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const complaints = useQuery({
    queryKey: portalKeys.complaints(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('complaints').select('*').is('deleted_at', null).order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const notices = useQuery({
    queryKey: portalKeys.notices(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notices').select('*').is('deleted_at', null).order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const invoices = useQuery({
    queryKey: [...portalKeys.all, 'invoices'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices').select('*').is('deleted_at', null).order('due_date', { ascending: false }).limit(24);
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const acknowledge = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('notices').update({ acknowledged_at: new Date().toISOString() }).eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: portalKeys.notices() }),
    onError: (e) => flash((e as Error).message, 'err'),
  });

  const openDoc = async (path: string) => {
    const { data, error } = await supabase.storage.from('tenant-documents').createSignedUrl(path, 300);
    if (error) return flash(error.message, 'err');
    window.open(data.signedUrl, '_blank', 'noopener');
  };

  if (home.isLoading) return <PageSpinner />;

  const { tenant, lease, unit } = home.data ?? { tenant: null, lease: null, unit: null };

  if (!tenant) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <EmptyState
          title="Your login isn't linked to a tenant record yet"
          hint={`Ask ${organizationName} to link your account — everything appears here once they do.`}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 md:p-6">
      <div>
        <p className="text-[11px] uppercase tracking-widest text-zinc-500">{organizationName}</p>
        <h1 className="mt-0.5 font-display text-xl font-semibold">Welcome, {tenant.full_name.split(' ')[0]}</h1>
      </div>

      {/* My lease */}
      <Card>
        <CardHeader title="My tenancy" />
        <CardBody>
          {!lease ? (
            <p className="text-sm text-zinc-500">No active tenancy on record.</p>
          ) : (
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">Unit</p>
                <p className="font-mono text-sm font-medium">{unit?.unit_number ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">Rent</p>
                <p className="tabular-nums">{money(lease.rent_amount)} <span className="text-xs text-zinc-400">/{lease.rent_frequency}</span></p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">Ends</p>
                <p className="font-mono text-xs">{lease.end_date}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">Status</p>
                <LeaseStatusBadge status={lease.status} />
              </div>
            </div>
          )}
          {lease?.status === 'expiring' && (
            <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
              Your tenancy ends on {lease.end_date}. Contact the management office about renewal.
            </p>
          )}
        </CardBody>
      </Card>

      {/* Report an issue */}
      {lease && unit && (
        <Card>
          <CardHeader title="Maintenance" subtitle="Something not working? Let the team know." />
          <CardBody>
            <Button variant="outline" onClick={() => setIssueOpen(true)}>Report an issue</Button>
          </CardBody>
        </Card>
      )}

      {/* Notices */}
      <Card>
        <CardHeader title="Notices" subtitle="Messages from the management office." />
        <CardBody>
          {(notices.data?.length ?? 0) === 0 ? (
            <p className="text-sm text-zinc-500">No notices.</p>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {notices.data!.map((n) => (
                <li key={n.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="zinc">{n.notice_type.replace('_', ' ')}</Badge>
                    <p className="text-sm font-medium">{n.title}</p>
                    <span className="ml-auto font-mono text-xs text-zinc-400">{new Date(n.created_at).toLocaleDateString()}</span>
                  </div>
                  {n.body && <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{n.body}</p>}
                  {!n.acknowledged_at && (
                    <Button variant="outline" className="mt-2" onClick={() => acknowledge.mutate(n.id)} disabled={acknowledge.isPending}>
                      Acknowledge
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* Complaints */}
      <Card>
        <CardHeader
          title="My complaints"
          action={
            lease ? (
              <Button variant="outline" onClick={() => setComplaintOpen(true)}>
                <Plus className="h-4 w-4" /> New complaint
              </Button>
            ) : undefined
          }
        />
        <CardBody>
          {(complaints.data?.length ?? 0) === 0 ? (
            <p className="text-sm text-zinc-500">Nothing raised. If something's wrong with your unit, tell us here.</p>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {complaints.data!.map((c) => (
                <li key={c.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{c.subject}</p>
                    <ComplaintBadge status={c.status} />
                    <span className="ml-auto font-mono text-xs text-zinc-400">{new Date(c.created_at).toLocaleDateString()}</span>
                  </div>
                  {c.description && <p className="mt-1 text-sm text-zinc-500">{c.description}</p>}
                  {c.resolution_note && (
                    <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-400">Resolution: {c.resolution_note}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* My invoices */}
      <Card>
        <CardHeader title="My invoices" subtitle="Rent and charges on your unit." />
        <CardBody>
          {(invoices.data?.length ?? 0) === 0 ? (
            <p className="text-sm text-zinc-500">No invoices yet.</p>
          ) : (
            <>
              {(() => {
                const bal = invoices.data!.reduce((s, i) => s + Math.max(0, Number(i.total) - Number(i.amount_paid)), 0);
                return (
                  <p className="mb-3 rounded-md bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-800/60">
                    Balance due: <span className="font-semibold tabular-nums">{money(bal)}</span>
                  </p>
                );
              })()}
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                {invoices.data!.map((i) => {
                  const bal = Math.max(0, Number(i.total) - Number(i.amount_paid));
                  return (
                    <li key={i.id} className="flex items-center gap-3 py-2.5 text-sm">
                      <span className="font-mono text-xs">{i.invoice_number}</span>
                      <span className="text-zinc-500">due {i.due_date}</span>
                      <span className="ml-auto tabular-nums">{money(Number(i.total))}</span>
                      {bal > 0
                        ? <Badge tone={i.status === 'overdue' ? 'red' : 'amber'}>{money(bal)} due</Badge>
                        : <Badge tone="green">paid</Badge>}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </CardBody>
      </Card>

      {/* Documents */}
      <Card>
        <CardHeader title="My documents" />
        <CardBody>
          {(documents.data?.length ?? 0) === 0 ? (
            <p className="text-sm text-zinc-500">No documents on file yet.</p>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {documents.data!.map((d) => (
                <li key={d.id} className="flex items-center gap-3 py-2.5">
                  <FileText className="h-4 w-4 shrink-0 text-zinc-400" />
                  <button onClick={() => void openDoc(d.storage_path)} className="truncate text-sm font-medium text-brand hover:underline">
                    {d.title}
                  </button>
                  <Badge tone="zinc">{d.category}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Dialog open={issueOpen} onClose={() => setIssueOpen(false)} title="Report a maintenance issue">
        {tenant && unit && (
          <PortalIssueForm
            tenantId={tenant.id}
            propertyId={unit.property_id}
            unitId={unit.id}
            onDone={(m, t) => { setIssueOpen(false); flash(m, t); }}
          />
        )}
      </Dialog>

      <Dialog open={complaintOpen} onClose={() => setComplaintOpen(false)} title="New complaint">
        {tenant && unit && (
          <PortalComplaintForm
            tenantId={tenant.id}
            propertyId={unit.property_id}
            unitId={unit.id}
            onDone={(m, t) => { setComplaintOpen(false); flash(m, t); void qc.invalidateQueries({ queryKey: portalKeys.complaints() }); }}
          />
        )}
      </Dialog>
      {toast && <Toast message={toast.msg} tone={toast.tone} />}
    </div>
  );
}

function PortalComplaintForm({
  tenantId, propertyId, unitId, onDone,
}: {
  tenantId: string;
  propertyId: string;
  unitId: string;
  onDone: (m: string, t?: 'ok' | 'err') => void;
}) {
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [pending, setPending] = useState(false);

  const submit = async () => {
    if (!subject.trim()) return onDone('Give it a short subject', 'err');
    setPending(true);
    const { error } = await supabase
      .from('complaints')
      .insert({ tenant_id: tenantId, property_id: propertyId, unit_id: unitId, subject: subject.trim(), description: description.trim() || null });
    setPending(false);
    if (error) return onDone(error.message, 'err');
    await rpc.logActivity({ module: 'tenants', action: 'complaint_raised', entityType: 'complaint', entityId: subject.trim() });
    onDone('Complaint submitted — the management team has been notified');
  };

  return (
    <div className="space-y-4">
      <Field label="Subject"><Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. AC not cooling" /></Field>
      <Field label="Details"><Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      <div className="flex justify-end">
        <Button onClick={() => void submit()} disabled={pending}>{pending ? 'Submitting…' : 'Submit complaint'}</Button>
      </div>
    </div>
  );
}

function PortalIssueForm({
  tenantId, propertyId, unitId, onDone,
}: {
  tenantId: string;
  propertyId: string;
  unitId: string;
  onDone: (m: string, t?: 'ok' | 'err') => void;
}) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<MaintenanceCategory>('other');
  const [priority, setPriority] = useState<RequestPriority>('medium');
  const [description, setDescription] = useState('');
  const [pending, setPending] = useState(false);

  const submit = async () => {
    if (!title.trim()) return onDone('Give it a short title', 'err');
    setPending(true);
    const { error } = await supabase.from('maintenance_requests').insert({
      property_id: propertyId, unit_id: unitId, tenant_id: tenantId,
      category, priority, title: title.trim(), description: description.trim() || null,
    });
    setPending(false);
    if (error) return onDone(error.message, 'err');
    await rpc.logActivity({ module: 'maintenance', action: 'request_raised_portal', entityType: 'maintenance_request', entityId: title.trim() });
    onDone('Reported — the maintenance team has been notified');
  };

  return (
    <div className="space-y-4">
      <Field label="What's the issue?"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Kitchen tap leaking" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category">
          <Select value={category} onChange={(e) => setCategory(e.target.value as MaintenanceCategory)}>
            {['plumbing', 'electrical', 'hvac', 'structural', 'cleaning', 'security', 'other'].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Urgency">
          <Select value={priority} onChange={(e) => setPriority(e.target.value as RequestPriority)}>
            {['low', 'medium', 'high', 'urgent'].map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Details"><Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      <div className="flex justify-end">
        <Button onClick={() => void submit()} disabled={pending}>{pending ? 'Reporting…' : 'Report issue'}</Button>
      </div>
    </div>
  );
}
