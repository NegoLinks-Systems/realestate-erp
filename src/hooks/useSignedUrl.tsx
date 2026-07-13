import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

const BUCKET = 'property-media';

export async function uploadPropertyFile(propertyId: string, kind: 'photos' | 'documents', file: File) {
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${propertyId}/${kind}/${Date.now()}-${safe}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file);
  if (error) throw new Error(error.message);
  return path;
}

export function useSignedUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ['signed-url', path],
    enabled: Boolean(path),
    staleTime: 45 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path as string, 3600);
      if (error) throw new Error(error.message);
      return data.signedUrl;
    },
  });
}

export function SignedImage({ path, alt = '', className = '' }: { path: string; alt?: string; className?: string }) {
  const { data } = useSignedUrl(path);
  if (!data) return <div className={`animate-pulse bg-zinc-100 dark:bg-zinc-800 ${className}`} />;
  return <img src={data} alt={alt} className={className} />;
}
