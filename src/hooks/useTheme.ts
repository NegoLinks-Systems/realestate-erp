import { useEffect, useState } from 'react';

export function useTheme() {
  const [dark, setDark] = useState<boolean>(() => {
    const stored = window.localStorage.getItem('erp-theme');
    if (stored) return stored === 'dark';
    return true; // NegoLinks enterprise standard is dark-base by default
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    window.localStorage.setItem('erp-theme', dark ? 'dark' : 'light');
  }, [dark]);

  return { dark, toggle: () => setDark((d) => !d) };
}
