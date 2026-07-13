import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { rpc } from '../../../lib/rpc';
import { propertyKeys } from '../../../api/keys';
import type { PropertyDocumentRow } from '../../../lib/database.types';
import { useAuth } from '../../../hooks/useAuth';
import { usePermissions } from '../../../hooks/usePermissions';
import { uploadPropertyFile } from '../../../hooks/useSignedUrl';
import { Card, CardBody } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Field, Input, Select } from '../../../components/ui/Field';
import { Dialog } from '../../../components/ui/Dialog';
import { Badge, EmptyState, PageSpinner, Toast } from '../../../components/ui/Bits';
import { usePropertyId } from '../PropertyDetail';

const CATEGORIES: PropertyDocumentRow['category'][] = ['title', 'survey', 'approval', 'insurance', 'valuation', 'contract', 'other'];

export default function DocumentsTab() {
  const propertyId = usePropertyId();
  const { user } = useAuth();
  const perms = usePermissions(user?.id);
  const qc = useQueryClient();
  const canEdit = perms.can('properties', 'update');
  const [addOpen, setAddOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'err' } | null>(null);
  const flash = (msg: string, tone: 'ok' | 'err' = 'ok') => { setToast({ msg, tone }); setTimeout(() => setToast(null), 3000); };

  const docs = useQuery({
    queryKey: propertyKeys.documents(propertyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('property_documents').select('*')
        .eq('property_id', propertyId).is('deleted_at', null).order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('property_documents').update({ deleted_at: new Date().toISOString() }).eq('id', id);
      if (error) throw new Error(error.message);
      await rpc.logActivity({ module: 'properties', action: 'document_removed', entityType: 'property_document', entityId: id });
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: propertyKeys.documents(propertyId) }); flash('Document removed'); },
    onError: (e) => flash((e as Error).message, 'err'),
  });

  const open = async (path: string) => {
    const { data, error } = await supabase.storage.from('property-media').createSignedUrl(path, 300);
    if (error) return flash(error.message, 'err');
    window.open(data.signedUrl, '_blank', 'noopener');
  };

  if (docs.isLoading) return <PageSpinner />;
  const list = docs.data ?? [];

  return (
    <div className="space-y-4">
      {canEdit && (
        <Button variant="outline" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" /> Add document
        </Button>
      )}

      {list.length === 0 ? (
        <EmptyState title="No documents yet" hint="Titles, surveys, approvals, insurance — keep the paper trail with the property." />
      ) : (
        <Card>
          <CardBody>
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {list.map((d) => (
                <li key={d.id} className="flex items-center gap-3 py-2.5">
                  <FileText className="h-4 w-4 shrink-0 text-zinc-400" />
                  <button onClick={() => void open(d.storage_path)} className="truncate text-sm font-medium text-brand hover:underline">
                    {d.title}
                  </button>
                  <Badge tone="zinc">{d.category}</Badge>
                  <span className="ml-auto font-mono text-xs text-zinc-400">
                    {new Date(d.created_at).toLocaleDateString()}
                  </span>
                  {canEdit && (
                    <button aria-label="Remove" onClick={() => remove.mutate(d.id)} className="rounded p-1 text-zinc-400 hover:text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} title="Add document">
        <AddDocumentForm
          propertyId={propertyId}
          onDone={(msg, tone) => {
            setAddOpen(false);
            flash(msg, tone);
            void qc.invalidateQueries({ queryKey: propertyKeys.documents(propertyId) });
          }}
        />
      </Dialog>
      {toast && <Toast message={toast.msg} tone={toast.tone} />}
    </div>
  );
}

function AddDocumentForm({ propertyId, onDone }: { propertyId: string; onDone: (msg: string, tone?: 'ok' | 'err') => void }) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<PropertyDocumentRow['category']>('other');
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async () => {
    if (!title.trim()) return onDone('Give the document a title', 'err');
    if (!file) return onDone('Choose a file', 'err');
    setPending(true);
    try {
      const path = await uploadPropertyFile(propertyId, 'documents', file);
      const { data, error } = await supabase
        .from('property_documents')
        .insert({ property_id: propertyId, title: title.trim(), category, storage_path: path })
        .select().single();
      if (error) throw new Error(error.message);
      await rpc.logActivity({ module: 'properties', action: 'document_added', entityType: 'property_document', entityId: data.id });
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
        <Select value={category} onChange={(e) => setCategory(e.target.value as PropertyDocumentRow['category'])}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
      </Field>
      <Field label="File">
        <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </Field>
      <div className="flex justify-end">
        <Button onClick={() => void submit()} disabled={pending}>{pending ? 'Uploading…' : 'Add document'}</Button>
      </div>
    </div>
  );
}
