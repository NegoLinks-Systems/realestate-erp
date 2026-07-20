/** Recharts theme for NegoLinks dashboards (component-library §13, colors per branding skill). */
export const CHART_COLORS = ['#94A3B8', '#818CF8', '#22C55E', '#F59E0B', '#3B82F6', '#64748B'];
export const CHART_GRID = 'rgba(255,255,255,0.06)';
export const CHART_AXIS = '#5A5A78';
export const chartTooltip = {
  contentStyle: {
    background: '#131325',
    border: '1px solid var(--accent-border)',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '12px',
  },
  labelStyle: { color: '#A0A0B8' },
  itemStyle: { color: '#fff' },
} as const;
