import { Zap } from 'lucide-react';
import { useBranding } from '../../providers/BrandingProvider';

/**
 * Shown at the top of the shell when demo data is active (component-library §16).
 * Reads a `demo_mode` flag from organization settings. The Demo Data Manager in
 * Phase 4 toggles that flag; until then this renders nothing.
 */
export function DemoModeBanner() {
  const branding = useBranding();
  const demo = (branding.settings as { demo_mode?: boolean } | undefined)?.demo_mode ?? false;
  if (!demo) return null;
  return (
    <div
      className="flex items-center justify-center gap-2 py-2 text-center text-sm font-semibold tracking-widest"
      style={{
        background: 'linear-gradient(90deg, var(--accent-glow), transparent)',
        borderBottom: '1px solid var(--accent-border)',
        color: 'var(--accent-light)',
      }}
    >
      <Zap className="h-3.5 w-3.5" /> DEMO MODE — Sample Data Loaded
    </div>
  );
}
