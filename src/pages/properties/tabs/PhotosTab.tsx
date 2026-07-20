import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Star, Trash2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { rpc } from '../../../lib/rpc';
import { propertyKeys } from '../../../api/keys';
import { useAuth } from '../../../hooks/useAuth';
import { usePermissions } from '../../../hooks/usePermissions';
import { SignedImage, uploadPropertyFile } from '../../../hooks/useSignedUrl';
import { Button } from '../../../components/ui/Button';
import { EmptyState, PageSpinner, Toast } from '../../../components/ui/Bits';
import { usePropertyId } from '../PropertyDetail';

export default function PhotosTab() {
  const propertyId = usePropertyId();
  const { user } = useAuth();
  const perms = usePermissions(user?.id);
  const qc = useQueryClient();
  const canEdit = perms.can('properties', 'update');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'err' } | null>(null);
  const flash = (msg: string, tone: 'ok' | 'err' = 'ok') => { setToast({ msg, tone }); setTimeout(() => setToast(null), 3000); };

  const photos = useQuery({
    queryKey: propertyKeys.photos(propertyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('property_photos').select('*')
        .eq('property_id', propertyId).is('deleted_at', null)
        .order('is_cover', { ascending: false }).order('sort_order').order('created_at');
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: propertyKeys.photos(propertyId) });

  const upload = async (files: FileList) => {
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const path = await uploadPropertyFile(propertyId, 'photos', file);
        const { data, error } = await supabase
          .from('property_photos')
          .insert({ property_id: propertyId, storage_path: path })
          .select().single();
        if (error) throw new Error(error.message);
        await rpc.logActivity({ module: 'properties', action: 'photo_added', entityType: 'property_photo', entityId: data.id });
      }
      invalidate();
      flash('Uploaded');
    } catch (e) {
      flash((e as Error).message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const setCover = useMutation({
    mutationFn: async (photoId: string) => {
      const { error: clearErr } = await supabase
        .from('property_photos').update({ is_cover: false })
        .eq('property_id', propertyId).eq('is_cover', true);
      if (clearErr) throw new Error(clearErr.message);
      const { error } = await supabase.from('property_photos').update({ is_cover: true }).eq('id', photoId);
      if (error) throw new Error(error.message);
      await rpc.logActivity({ module: 'properties', action: 'cover_set', entityType: 'property_photo', entityId: photoId });
    },
    onSuccess: () => { invalidate(); flash('Cover photo updated'); },
    onError: (e) => flash((e as Error).message, 'err'),
  });

  const remove = useMutation({
    mutationFn: async (photoId: string) => {
      const { error } = await supabase
        .from('property_photos').update({ deleted_at: new Date().toISOString() }).eq('id', photoId);
      if (error) throw new Error(error.message);
      await rpc.logActivity({ module: 'properties', action: 'photo_removed', entityType: 'property_photo', entityId: photoId });
    },
    onSuccess: () => { invalidate(); flash('Photo removed'); },
    onError: (e) => flash((e as Error).message, 'err'),
  });

  if (photos.isLoading) return <PageSpinner />;
  const list = photos.data ?? [];

  return (
    <div className="space-y-4">
      {canEdit && (
        <label className="inline-flex">
          <Button variant="outline" disabled={busy} onClick={(e) => { (e.currentTarget.nextSibling as HTMLInputElement).click(); }}>
            <ImagePlus className="h-4 w-4" /> {busy ? 'Uploading…' : 'Upload photos'}
          </Button>
          <input type="file" accept="image/*" multiple className="hidden"
            onChange={(e) => { if (e.target.files?.length) void upload(e.target.files); e.target.value = ''; }} />
        </label>
      )}

      {list.length === 0 ? (
        <EmptyState title="No photos yet" hint="Photos make listings and reports feel real — the first one becomes the cover." />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {list.map((p) => (
            <div key={p.id} className="group relative overflow-hidden rounded-lg border border-zinc-200 dark:border-[#1C1C34]">
              <SignedImage path={p.storage_path} alt={p.caption ?? ''} className="h-36 w-full object-cover" />
              {p.is_cover && (
                <span className="absolute left-2 top-2 rounded bg-brand px-1.5 py-0.5 text-[10px] font-medium text-white">Cover</span>
              )}
              {canEdit && (
                <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                  {!p.is_cover && (
                    <button aria-label="Set as cover" onClick={() => setCover.mutate(p.id)}
                      className="rounded bg-white/90 p-1.5 text-zinc-700 hover:bg-white">
                      <Star className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button aria-label="Remove photo" onClick={() => remove.mutate(p.id)}
                    className="rounded bg-white/90 p-1.5 text-red-600 hover:bg-white">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {toast && <Toast message={toast.msg} tone={toast.tone} />}
    </div>
  );
}
