import { useBranding } from '../providers/BrandingProvider';

export type FeatureFlags = Record<string, boolean>;

/**
 * Module/feature flags from organization_settings.feature_flags.
 * A module is enabled unless explicitly set to false, so existing
 * deployments (empty flags) behave exactly as before.
 */
export function useFeatureFlags() {
  const branding = useBranding();
  const flags = ((branding.settings as { feature_flags?: FeatureFlags } | undefined)?.feature_flags ?? {}) as FeatureFlags;
  const isEnabled = (key: string) => flags[key] !== false;
  return { flags, isEnabled };
}
