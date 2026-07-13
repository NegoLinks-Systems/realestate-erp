import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { rpc } from '../../lib/rpc';
import { orgKeys } from '../../api/keys';
import type { OrganizationSettingsRow } from '../../lib/database.types';

/** Update the singleton org settings row + audit + refresh branding. */
export function useOrgSettingsMutation(section: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<OrganizationSettingsRow>) => {
      const { data: before } = await supabase.from('organization_settings').select('*').limit(1).single();
      const { error } = await supabase.from('organization_settings').update(patch).eq('singleton', true);
      if (error) throw new Error(error.message);
      await rpc.logActivity({
        module: 'settings',
        action: 'updated',
        entityType: 'organization_settings',
        entityId: section,
        before: before ? (JSON.parse(JSON.stringify(before)) as never) : undefined,
        after: JSON.parse(JSON.stringify(patch)) as never,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: orgKeys.settings() }),
  });
}

/** Upload a branding asset and return its public URL. Bucket 'branding' must exist (public). */
export async function uploadBrandingAsset(file: File, key: string): Promise<string> {
  const path = `${key}-${Date.now()}.${file.name.split('.').pop()}`;
  const { error } = await supabase.storage.from('branding').upload(path, file, { upsert: true });
  if (error) throw new Error(error.message);
  return supabase.storage.from('branding').getPublicUrl(path).data.publicUrl;
}

export function useSaveState() {
  return { saved: 'Saved', saving: 'Saving…' } as const;
}
