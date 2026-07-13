import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Plus, Send } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { rpc } from '../../lib/rpc';
import { tenantKeys } from '../../api/keys';
import type { ComplaintRow, ComplaintStatus, NoticeRow, TenantDocumentRow } from '../../lib/database.types';
import type { TenantInput } from '../../schemas';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { useMoney } from '../../providers/BrandingProvider';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Field, Input, Select, Textarea } from '../../components/ui/Field';
import { Dialog } from '../../components/ui/Dialog';
import { Badge, EmptyState, PageSpinner, Toast } from '../../components/ui/Bits';
import { TenantForm } from './TenantsList';
import { LeaseStatusBadge } from '../leases/shared';

const TABS = ['Profile', 'Leases', 'Documents', 'Complaints', 'Notices'] as const;
type Tab = (typeof TABS)[number];

const DOC_CATEGORIES: TenantDocumentRow['category'][] = ['id', 'reference', 'guarantor', 'contract', 'other'];
const COMPLAINT_STATUSES: ComplaintStatus[] = ['open', 'in_progress', 'resolved', 'closed'];
const NOTICE_TYPES: NoticeRow['notice_type'][] = ['general', 'renewal', 'rent_review', 'quit', 'warning', 'maintenance'];

export default function TenantDetail() {
  const id = useParams<{ id: string }>().id as string;
  const { user } = useAuth();
  const perms = usePermissions(user?.id);
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('Profile');
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'err' } | null>(null);
  const flash = (msg: string, tone: 'ok' | 'err' = 'ok') => { setToast({ msg, tone }); setTimeout(() => setToast(null), 3000); };

  const tenant = useQuery({
    queryKey: tenantKeys.detail(id),
    queryFn: async () => {
      const { data, error } = await supabase.from('tenants').select('*').eq('id', id).single();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const update = useMutation({
    mutationFn: async (values: TenantInput) => {
      const t = tenant.data;
      if (!t) throw new Error('Not loaded');
      const { error } = await supabase.from('tenants').update(values).eq('id', id);
      if (error) throw new Error(error.message);
      await rpc.logActivity({
        module: 'tenants', action: 'updated', entityType: 'tenant', entityId: id,
        before: JSON.parse(JSON.stringify(t)) as never, after: JSON.parse(JSON.stringify(values)) as never,
      });
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: tenantKeys.all }); flash('Tenant updated'); },
    onError: (e) => flash((e as Error).message, 'err'),
  });

  if (tenant.isLoading) return <PageSpinner />;
  if (!tenant.data) return <div className="p-6"><EmptyState title="Tenant not found" /></div>;
  const t = tenant.data;

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <p className="text-[11px] uppercase tracking-widest text-zinc-500">Tenant · {t.kind}</p>
      <div className="mt-0.5 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-xl font-semibold">{t.full_name}</h1>
        {t.user_id ? <Badge tone="green">portal linked</Badge> : <Badge tone="zinc">no portal login</Badge>}
      </div>

      <div className="mt-4 flex gap-1 overflow-x-auto border-b border-zinc-200 dark:border-zinc-800">
        {TABS.map((x) => (
          <button
            key={x}
            onClick={() => setTab(x)}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
              tab === x ? 'border-brand text-brand' : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            {x}
          </button>
        ))}
      </div>

      <div className="py-5">
        {tab === 'Profile' && (
          <Card>
            <CardHeader title="Profile" />
            <CardBody>
              <TenantForm
                existing={t}
                pending={update.isPending}
                error={update.isError ? (update.error as Error).message : null}
                onSubmit={(v) => update.mutate(v)}
              />
            </CardBody>
          </Card>
        )}
        {tab === 'Leases' && <LeasesTab tenantId={id} />}
        {tab === 'Documents' && <DocumentsTab tenantId={id} canEdit={perms.can('tenants', 'update')} flash={flash} />}
        {tab === 'Complaints' && <ComplaintsTab tenantId={id} canEdit={perms.can('tenants', 'update')} flash={flash} />}
        {tab === 'Notices' && <NoticesTab tenantId={id} canEdit={perms.can('tenants', 'update')} flash={flash} />}
      </div>
      {toast && <Toast message={toast.msg} tone={toast.tone} />}
    </div>
  );
}

/* -------- leases -------- */
function LeasesTab({ tenantId }: { tenantId: string }) {
  const money = useMoney();
  const leases = useQuery({
    queryKey: tenantKeys.leases(tenantId),
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('leases').select('*').eq('tenant_id', tenantId).is('deleted_at', null)
        .order('start_date', { ascending: false });
      if (error) throw new Error(error.message);
      const unitIds = [...new Set(rows.map((l) => l.unit_id))];
      const { data: units } = unitIds.length
        ? await supabase.from('units').select('id, unit_number').in('id', unitIds)
        : { data: [] };
      const unitOf = (uid: string) => units?.find((u) => u.id === uid)?.unit_number ?? '—';
      return rows.map((l) => ({ ...l, unit_number: unitOf(l.unit_id) }));
    },
  });

  if (leases.isLoading) return <PageSpinner />;
  const list = leases.data ?? [];

  return list.length === 0 ? (
    <EmptyState title="No leases yet" hint="Create one from the Leases page — this tenant will appear in the wizard." />
  ) : (
    <Card>
      <CardBody className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
              <th className="py-2 pr-4">Unit</th>
              <th className="py-2 pr-4">Period</th>
              <th className="py-2 pr-4">Rent</th>
              <th className="py-2 pr-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {list.map((l) => (
              <tr key={l.id} className="border-b border-zinc-100 dark:border-zinc-800/60">
                <td className="py-2.5 pr-4">
                  <Link to={`/leases/${l.id}`} className="font-mono text-xs font-medium text-brand hover:underline">{l.unit_number}</Link>
                </td>
                <td className="py-2.5 pr-4 font-mono text-xs">{l.start_date} → {l.end_date}</td>
                <td className="py-2.5 pr-4 tabular-nums">{money(l.rent_amount)} <span className="text-xs text-zinc-400">/{l.rent_frequency}</span></td>
                <td className="py-2.5 pr-4"><LeaseStatusBadge status={l.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardBody>
    </Card>
  );
}

/* -------- documents -------- */
function DocumentsTab({ tenantId, canEdit, flash }: { tenantId: string; canEdit: boolean; flash: (m: string, t?: 'ok' | 'err') => void }) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);

  const docs = useQuery({
    queryKey: tenantKeys.documents(tenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenant_documents').select('*').eq('tenant_id', tenantId).is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const open = async (path: string) => {
    const { data, error } = await supabase.storage.from('tenant-documents').createSignedUrl(path, 300);
    if (error) return flash(error.message, 'err');
    window.open(data.signedUrl, '_blank', 'noopener');
  };

  if (docs.isLoading) return <PageSpinner />;
  const list = docs.data ?? [];

  return (
    <div className="space-y-4">
      {canEdit && <Button variant="outline" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add document</Button>}
      {list.length === 0 ? (
        <EmptyState title="No documents" hint="KYC, references, guarantors — keep them with the tenant record." />
      ) : (
        <Card><CardBody>
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {list.map((d) => (
              <li key={d.id} className="flex items-center gap-3 py-2.5">
                <FileText className="h-4 w-4 shrink-0 text-zinc-400" />
                <button onClick={() => void open(d.storage_path)} className="truncate text-sm font-medium text-brand hover:underline">{d.title}</button>
                <Badge tone="zinc">{d.category}</Badge>
                <span className="ml-auto font-mono text-xs text-zinc-400">{new Date(d.created_at).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </CardBody></Card>
      )}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} title="Add tenant document">
        <TenantDocForm tenantId={tenantId} onDone={(m, t) => { setAddOpen(false); flash(m, t); void qc.invalidateQueries({ queryKey: tenantKeys.documents(tenantId) }); }} />
      </Dialog>
    </div>
  );
}

function TenantDocForm({ tenantId, onDone }: { tenantId: string; onDone: (m: string, t?: 'ok' | 'err') => void }) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<TenantDocumentRow['category']>('id');
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async () => {
    if (!title.trim()) return onDone('Give it a title', 'err');
    if (!file) return onDone('Choose a file', 'err');
    setPending(true);
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${tenantId}/${Date.now()}-${safe}`;
      const { error: upErr } = await supabase.storage.from('tenant-documents').upload(path, file);
      if (upErr) throw new Error(upErr.message);
      const { data, error } = await supabase
        .from('tenant_documents')
        .insert({ tenant_id: tenantId, title: title.trim(), category, storage_path: path })
        .select().single();
      if (error) throw new Error(error.message);
      await rpc.logActivity({ module: 'tenants', action: 'document_added', entityType: 'tenant_document', entityId: data.id });
      onDone('Document added');
    } catch (e) {
      onDone((e as Error).message, 'err');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-4">
      <Field label="Title"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <Field label="Category">
        <Select value={category} onChange={(e) => setCategory(e.target.value as TenantDocumentRow['category'])}>
          {DOC_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
      </Field>
      <Field label="File"><Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
      <div className="flex justify-end">
        <Button onClick={() => void submit()} disabled={pending}>{pending ? 'Uploading…' : 'Add document'}</Button>
      </div>
    </div>
  );
}

/* -------- complaints -------- */
function ComplaintsTab({ tenantId, canEdit, flash }: { tenantId: string; canEdit: boolean; flash: (m: string, t?: 'ok' | 'err') => void }) {
  const qc = useQueryClient();

  const complaints = useQuery({
    queryKey: tenantKeys.complaints(tenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('complaints').select('*').eq('tenant_id', tenantId).is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ row, status }: { row: ComplaintRow; status: ComplaintStatus }) => {
      const patch: Partial<ComplaintRow> = { status };
      if (status === 'resolved') patch.resolved_at = new Date().toISOString();
      const { error } = await supabase.from('complaints').update(patch).eq('id', row.id);
      if (error) throw new Error(error.message);
      await rpc.logActivity({ module: 'tenants', action: 'complaint_' + status, entityType: 'complaint', entityId: row.id });
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: tenantKeys.complaints(tenantId) }); flash('Updated'); },
    onError: (e) => flash((e as Error).message, 'err'),
  });

  if (complaints.isLoading) return <PageSpinner />;
  const list = complaints.data ?? [];

  return list.length === 0 ? (
    <EmptyState title="No complaints" hint="Tenant-raised complaints from the portal land here." />
  ) : (
    <Card><CardBody>
      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
        {list.map((c) => (
          <li key={c.id} className="py-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium">{c.subject}</p>
              <ComplaintBadge status={c.status} />
              <span className="ml-auto font-mono text-xs text-zinc-400">{new Date(c.created_at).toLocaleDateString()}</span>
              {canEdit && (
                <Select
                  value={c.status}
                  onChange={(e) => setStatus.mutate({ row: c, status: e.target.value as ComplaintStatus })}
                  className="w-36"
                >
                  {COMPLAINT_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </Select>
              )}
            </div>
            {c.description && <p className="mt-1 text-sm text-zinc-500">{c.description}</p>}
          </li>
        ))}
      </ul>
    </CardBody></Card>
  );
}

export function ComplaintBadge({ status }: { status: ComplaintStatus }) {
  const tone = status === 'open' ? 'amber' : status === 'in_progress' ? 'brand' : status === 'resolved' ? 'green' : 'zinc';
  return <Badge tone={tone as 'amber' | 'brand' | 'green' | 'zinc'}>{status.replace('_', ' ')}</Badge>;
}

/* -------- notices -------- */
function NoticesTab({ tenantId, canEdit, flash }: { tenantId: string; canEdit: boolean; flash: (m: string, t?: 'ok' | 'err') => void }) {
  const qc = useQueryClient();
  const [issueOpen, setIssueOpen] = useState(false);

  const notices = useQuery({
    queryKey: tenantKeys.notices(tenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notices').select('*').eq('tenant_id', tenantId).is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data;
    },
  });

  if (notices.isLoading) return <PageSpinner />;
  const list = notices.data ?? [];

  return (
    <div className="space-y-4">
      {canEdit && <Button variant="outline" onClick={() => setIssueOpen(true)}><Send className="h-4 w-4" /> Issue notice</Button>}
      {list.length === 0 ? (
        <EmptyState title="No notices issued" hint="Renewal reminders, rent reviews, warnings — issued notices show on the tenant's portal." />
      ) : (
        <Card><CardBody>
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {list.map((n) => (
              <li key={n.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="zinc">{n.notice_type.replace('_', ' ')}</Badge>
                  <p className="text-sm font-medium">{n.title}</p>
                  <span className="ml-auto font-mono text-xs text-zinc-400">{new Date(n.created_at).toLocaleDateString()}</span>
                  {n.acknowledged_at ? <Badge tone="green">acknowledged</Badge> : <Badge tone="amber">unread</Badge>}
                </div>
                {n.body && <p className="mt-1 text-sm text-zinc-500">{n.body}</p>}
              </li>
            ))}
          </ul>
        </CardBody></Card>
      )}
      <Dialog open={issueOpen} onClose={() => setIssueOpen(false)} title="Issue notice">
        <NoticeForm tenantId={tenantId} onDone={(m, t) => { setIssueOpen(false); flash(m, t); void qc.invalidateQueries({ queryKey: tenantKeys.notices(tenantId) }); }} />
      </Dialog>
    </div>
  );
}

function NoticeForm({ tenantId, onDone }: { tenantId: string; onDone: (m: string, t?: 'ok' | 'err') => void }) {
  const [type, setType] = useState<NoticeRow['notice_type']>('general');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pending, setPending] = useState(false);

  const submit = async () => {
    if (!title.trim()) return onDone('Give the notice a title', 'err');
    setPending(true);
    const { data, error } = await supabase
      .from('notices')
      .insert({ tenant_id: tenantId, notice_type: type, title: title.trim(), body: body.trim() || null })
      .select().single();
    setPending(false);
    if (error) return onDone(error.message, 'err');
    await rpc.logActivity({ module: 'tenants', action: 'notice_issued', entityType: 'notice', entityId: data.id });
    onDone('Notice issued');
  };

  return (
    <div className="space-y-4">
      <Field label="Type">
        <Select value={type} onChange={(e) => setType(e.target.value as NoticeRow['notice_type'])}>
          {NOTICE_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
        </Select>
      </Field>
      <Field label="Title"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <Field label="Body"><Textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
      <div className="flex justify-end">
        <Button onClick={() => void submit()} disabled={pending}>{pending ? 'Issuing…' : 'Issue notice'}</Button>
      </div>
    </div>
  );
}
