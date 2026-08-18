"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import {
  DEFAULT_PREFERENCE,
  PREFERS_DARK_QUERY,
  THEME_STORAGE_KEY,
  isThemePreference,
  resolveTheme,
  type ThemeDefinition,
  type ThemePreference,
} from "@/lib/themes";

interface ThemeContextValue {
  /** What the user picked — may be `"system"`. */
  preference: ThemePreference;
  /** What that currently means, with `"system"` already resolved against the OS. */
  theme: ThemeDefinition;
  /** What `"system"` resolves to right now, whatever the current preference is. */
  systemTheme: ThemeDefinition;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : DEFAULT_PREFERENCE;
  } catch {
    // Safari in private mode, storage disabled by policy, …
    return DEFAULT_PREFERENCE;
  }
}

// One MediaQueryList for the app: useSyncExternalStore polls getSnapshot on every render, and
// there's no reason to build a fresh one each time.
let prefersDarkQuery: MediaQueryList | undefined;
function getPrefersDarkQuery(): MediaQueryList {
  return (prefersDarkQuery ??= window.matchMedia(PREFERS_DARK_QUERY));
}

function subscribeToPrefersDark(onChange: () => void): () => void {
  const query = getPrefersDarkQuery();
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Seeded from the same place the <head> script reads, so React's first client render already
  // agrees with the DOM that script produced.
  const [preference, setPreferenceState] = useState<ThemePreference>(() =>
    typeof window === "undefined" ? DEFAULT_PREFERENCE : readStoredPreference(),
  );

  // Only consulted while the preference is "system", but subscribing unconditionally keeps the
  // hook order stable and costs one media query listener.
  const prefersDark = useSyncExternalStore(
    subscribeToPrefersDark,
    () => getPrefersDarkQuery().matches,
    () => false,
  );

  const theme = resolveTheme(preference, prefersDark);
  const systemTheme = resolveTheme("system", prefersDark);

  // Layout, not passive: on the dev-only Strict Mode remount React resets <html> to just the
  // attributes it renders from JSX, wiping what the head script set — this puts them back
  // before the browser paints. In production it's a no-op on mount and the switch on change.
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", theme.id);
    root.setAttribute("data-scheme", theme.scheme);

    // The address bar / PWA status bar isn't ours to style with CSS, so hand it the theme's
    // page background — read back from the cascade rather than duplicated here in JS. The tag
    // is created rather than looked up: `viewport` in the root layout deliberately doesn't
    // declare a themeColor (a hardcoded one would be wrong for every theme but one), so on the
    // first load there's nothing here to find yet.
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    const background = getComputedStyle(root).getPropertyValue("--background").trim();
    if (background) meta.content = background;
  }, [theme]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Not persisting is survivable; the theme still applies for this session.
    }
  }, []);

  const value = useMemo(
    () => ({ preference, theme, systemTheme, setPreference }),
    [preference, theme, systemTheme, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within a ThemeProvider");
  return context;
}
