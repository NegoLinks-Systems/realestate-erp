import type { ReactNode } from 'react';
import { Sparkles, TrendingUp, AlertTriangle, Lightbulb, BarChart3 } from 'lucide-react';

export type InsightCategory = 'Revenue' | 'Alert' | 'Forecast' | 'Opportunity';

export interface Insight {
  category: InsightCategory;
  text: string;
}

const CATEGORY_META: Record<InsightCategory, { icon: typeof TrendingUp; tone: string }> = {
  Revenue: { icon: TrendingUp, tone: 'text-emerald-400 bg-emerald-400/10' },
  Alert: { icon: AlertTriangle, tone: 'text-amber-400 bg-amber-400/10' },
  Forecast: { icon: BarChart3, tone: 'text-sky-400 bg-sky-400/10' },
  Opportunity: { icon: Lightbulb, tone: 'text-violet-400 bg-violet-400/10' },
};

/**
 * Smart Insights widget (component-library §8).
 *
 * These insights are derived directly from the organization's live figures
 * (collection rate, arrears, occupancy, expiring leases) — they are real,
 * explainable, and deterministic, NOT language-model output. The full
 * AI narrative analysis ("View full analysis") arrives with the AI Platform
 * in a later phase; until then this surfaces genuine data signals.
 */
export function SmartInsights({ insights, footer }: { insights: Insight[]; footer?: ReactNode }) {
  return (
    <div className="h-full rounded-xl border border-zinc-200 bg-white p-5 dark:border-[#1C1C34] dark:bg-[#131325]"
      style={{ borderLeft: '4px solid var(--accent-primary)' }}>
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4" style={{ color: 'var(--accent-light)' }} />
        <h3 className="font-display text-sm font-semibold text-zinc-900 dark:text-white">Smart Insights</h3>
      </div>
      {insights.length === 0 ? (
        <p className="text-sm text-zinc-500">Insights appear here as your live data grows.</p>
      ) : (
        <ul className="space-y-3">
          {insights.map((ins, i) => {
            const meta = CATEGORY_META[ins.category];
            const Icon = meta.icon;
            return (
              <li key={i} className="flex gap-2.5">
                <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${meta.tone}`}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{ins.category}</span>
                  <p className="text-sm leading-snug text-zinc-700 dark:text-zinc-200">{ins.text}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {footer && <div className="mt-4 border-t border-zinc-200 pt-3 dark:border-[#1C1C34]">{footer}</div>}
    </div>
  );
}
