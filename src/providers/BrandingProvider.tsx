/**
 * BrandingProvider — the runtime half of the white-label rule.
 *
 * Loads the single organization_settings row and:
 *  - exposes it via useBranding()
 *  - sets document.title to the configured application name
 *  - swaps the favicon to the configured one
 *  - writes theme colors onto :root as CSS variables
 *    (--brand-primary / --brand-secondary / --brand-accent),
 *    which tailwind.config maps into the color palette.
 *
 * Nothing anywhere else in the app may hardcode a name, logo,
 * color, or domain. If you need a branded value, take it from
 * useBranding().
 */
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { orgKeys } from '../api/keys';
import type { OrganizationSettingsRow } from '../lib/database.types';

interface ThemeColors {
  primary?: string;
  secondary?: string;
  accent?: string;
}

interface AiBranding {
  name?: string;
  tagline?: string;
  avatar_url?: string | null;
}

export interface Branding {
  settings: OrganizationSettingsRow | null;
  organizationName: string;
  applicationName: string;
  logoUrl: string | null;
  currency: string;
  dateFormat: string;
  timezone: string;
  themeColors: ThemeColors;
  aiName: string;
  isLoading: boolean;
}

const FALLBACK: Branding = {
  settings: null,
  organizationName: 'My Organization',
  applicationName: 'Real Estate ERP',
  logoUrl: null,
  currency: 'NGN',
  dateFormat: 'DD/MM/YYYY',
  timezone: 'Africa/Lagos',
  themeColors: {},
  aiName: 'Assistant',
  isLoading: true,
};

const BrandingContext = createContext<Branding>(FALLBACK);

async function loadSettings(): Promise<OrganizationSettingsRow> {
  const { data, error } = await supabase
    .from('organization_settings')
    .select('*')
    .limit(1)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

function applyDocumentBranding(settings: OrganizationSettingsRow) {
  document.title = settings.application_name;

  if (settings.favicon_url) {
    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = settings.favicon_url;
  }

  const colors = (settings.theme_colors ?? {}) as ThemeColors;
  const root = document.documentElement;
  if (colors.primary) root.style.setProperty('--brand-primary', colors.primary);
  if (colors.secondary) root.style.setProperty('--brand-secondary', colors.secondary);
  if (colors.accent) root.style.setProperty('--brand-accent', colors.accent);
}

export function BrandingProvider({ children }: { children: ReactNode }) {
  const query = useQuery({
    queryKey: orgKeys.settings(),
    queryFn: loadSettings,
    staleTime: 10 * 60 * 1000,
  });

  useEffect(() => {
    if (query.data) applyDocumentBranding(query.data);
  }, [query.data]);

  const settings = query.data ?? null;
  const ai = (settings?.ai_branding ?? {}) as AiBranding;

  const value: Branding = settings
    ? {
        settings,
        organizationName: settings.organization_name,
        applicationName: settings.application_name,
        logoUrl: settings.logo_url,
        currency: settings.currency,
        dateFormat: settings.date_format,
        timezone: settings.timezone,
        themeColors: (settings.theme_colors ?? {}) as ThemeColors,
        aiName: ai.name ?? 'Assistant',
        isLoading: false,
      }
    : { ...FALLBACK, isLoading: query.isLoading };

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding(): Branding {
  return useContext(BrandingContext);
}

/** Format an amount in the organization's configured currency. */
export function useMoney() {
  const { currency } = useBranding();
  const formatter = new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  });
  return (amount: number) => formatter.format(amount);
}
