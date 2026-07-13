import { useEffect, useState } from 'react';
import { useBranding } from '../../providers/BrandingProvider';
import { useOrgSettingsMutation, uploadBrandingAsset } from './shared';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Field, Input } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';
import { PageSpinner, Toast } from '../../components/ui/Bits';

interface Colors { primary: string; secondary: string; accent: string }
const HEX = /^#[0-9a-fA-F]{6}$/;

export default function BrandingSettings() {
  const { settings, isLoading } = useBranding();
  const mutation = useOrgSettingsMutation('branding');
  const [colors, setColors] = useState<Colors>({ primary: '#1d4ed8', secondary: '#0f172a', accent: '#f59e0b' });
  const [headline, setHeadline] = useState('');
  const [uploading, setUploading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'err' } | null>(null);

  useEffect(() => {
    if (settings) {
      const c = (settings.theme_colors ?? {}) as Partial<Colors>;
      setColors({ primary: c.primary ?? '#1d4ed8', secondary: c.secondary ?? '#0f172a', accent: c.accent ?? '#f59e0b' });
      const lb = (settings.login_branding ?? {}) as { headline?: string };
      setHeadline(lb.headline ?? '');
    }
  }, [settings]);

  if (isLoading || !settings) return <PageSpinner />;

  const flash = (msg: string, tone: 'ok' | 'err' = 'ok') => {
    setToast({ msg, tone });
    setTimeout(() => setToast(null), 2500);
  };

  const saveColors = async () => {
    for (const [k, v] of Object.entries(colors)) {
      if (!HEX.test(v)) return flash(`"${k}" needs a hex value like #1d4ed8`, 'err');
    }
    await mutation.mutateAsync({ theme_colors: colors as never, login_branding: { headline } as never });
    flash('Branding saved — colours applied live');
  };

  const upload = async (file: File, field: 'logo_url' | 'favicon_url' | 'letterhead_url' | 'stamp_url' | 'signature_url') => {
    setUploading(field);
    try {
      const url = await uploadBrandingAsset(file, field.replace('_url', ''));
      await mutation.mutateAsync({ [field]: url });
      flash('Uploaded');
    } catch (e) {
      flash((e as Error).message, 'err');
    } finally {
      setUploading(null);
    }
  };

  const assets: { field: 'logo_url' | 'favicon_url' | 'letterhead_url' | 'stamp_url' | 'signature_url'; label: string; current: string | null }[] = [
    { field: 'logo_url', label: 'Logo', current: settings.logo_url },
    { field: 'favicon_url', label: 'Favicon', current: settings.favicon_url },
    { field: 'letterhead_url', label: 'Letterhead', current: settings.letterhead_url },
    { field: 'stamp_url', label: 'Digital stamp', current: settings.stamp_url },
    { field: 'signature_url', label: 'Digital signature', current: settings.signature_url },
  ];

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Theme colours" subtitle="Applied instantly across the app as CSS variables." />
        <CardBody className="grid gap-4 md:grid-cols-3">
          {(Object.keys(colors) as (keyof Colors)[]).map((k) => (
            <Field key={k} label={k.charAt(0).toUpperCase() + k.slice(1)}>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={HEX.test(colors[k]) ? colors[k] : '#000000'}
                  onChange={(e) => setColors((c) => ({ ...c, [k]: e.target.value }))}
                  className="h-9 w-10 cursor-pointer rounded border border-zinc-300 dark:border-zinc-700"
                  aria-label={`${k} colour`}
                />
                <Input value={colors[k]} onChange={(e) => setColors((c) => ({ ...c, [k]: e.target.value }))} />
              </div>
            </Field>
          ))}
          <div className="md:col-span-3">
            <Field label="Login screen headline" hint="Shown under the app name on the sign-in page.">
              <Input value={headline} onChange={(e) => setHeadline(e.target.value)} />
            </Field>
          </div>
        </CardBody>
        <div className="flex justify-end border-t border-zinc-200 px-5 py-3 dark:border-zinc-800">
          <Button onClick={() => void saveColors()} disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save branding'}
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader title="Brand assets" subtitle="Uploads go to the 'branding' storage bucket." />
        <CardBody className="grid gap-4 md:grid-cols-2">
          {assets.map((a) => (
            <div key={a.field} className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
              <div className="flex items-center gap-3">
                {a.current ? (
                  <img src={a.current} alt="" className="h-10 w-10 rounded object-contain ring-1 ring-zinc-200 dark:ring-zinc-700" />
                ) : (
                  <div className="h-10 w-10 rounded bg-zinc-100 dark:bg-zinc-800" />
                )}
                <span className="text-sm font-medium">{a.label}</span>
              </div>
              <label className="cursor-pointer text-sm font-medium text-brand hover:underline">
                {uploading === a.field ? 'Uploading…' : a.current ? 'Replace' : 'Upload'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploading !== null}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void upload(f, a.field);
                  }}
                />
              </label>
            </div>
          ))}
        </CardBody>
      </Card>
      {toast && <Toast message={toast.msg} tone={toast.tone} />}
    </div>
  );
}
