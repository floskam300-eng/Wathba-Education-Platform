import { useEffect } from 'react';

/**
 * Public-facing pages (landing page, terms, privacy, login, parent portal…)
 * are only ever designed in light mode. The dark-mode toggle lives in
 * ThemeContext and persists to localStorage app-wide, so if a teacher/student
 * enabled dark mode inside their dashboard, that preference leaks into these
 * public pages too — and since they use plain Tailwind classes (bg-white,
 * text-[#0B3C5D], etc.) rather than dark-mode-aware ones, the global
 * `html.dark` CSS overrides in index.css clash badly with their hardcoded
 * colors (unreadable text, mismatched card backgrounds).
 *
 * This hook forces `dark` off while the page is mounted and restores the
 * previous state on unmount, so the dashboard's preference is untouched.
 */
export function useForceLightMode() {
  useEffect(() => {
    const root = document.documentElement;
    const wasDark = root.classList.contains('dark');
    if (wasDark) root.classList.remove('dark');
    return () => {
      if (wasDark) root.classList.add('dark');
    };
  }, []);
}
