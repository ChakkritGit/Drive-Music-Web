/**
 * The app's colour language is a single neutral ramp (`zinc-50` … `zinc-950`, plus white/black
 * for the extremes) and one accent — see globals.css. A "theme" is nothing more than a different
 * set of values for that ramp, so every existing `bg-zinc-100 dark:bg-zinc-900` re-skins itself
 * with no component changes. The actual colours live in globals.css under `[data-theme="…"]`;
 * this module only knows the *names*, so there's no palette duplicated between CSS and TS.
 */

export type ThemeScheme = "light" | "dark";

export type ThemeId =
  | "light"
  | "dark"
  | "retro"
  | "ocean"
  | "sakura"
  | "horror"
  | "synthwave"
  | "terminal";

/** What the user picked. `"system"` resolves to `light`/`dark` from the OS at runtime. */
export type ThemePreference = ThemeId | "system";

export interface ThemeDefinition {
  id: ThemeId;
  label: string;
  description: string;
  /** Which end of the ramp is the background — i.e. whether Tailwind's `dark:` utilities apply. */
  scheme: ThemeScheme;
}

export const THEMES: readonly ThemeDefinition[] = [
  {
    id: "light",
    label: "Light",
    description: "Plain white and zinc.",
    scheme: "light",
  },
  {
    id: "dark",
    label: "Dark",
    description: "Plain near-black and zinc.",
    scheme: "dark",
  },
  {
    id: "retro",
    label: "Retro",
    description: "Cream paper, sepia ink, burnt orange — and a serif to match.",
    scheme: "light",
  },
  {
    id: "ocean",
    label: "Ocean",
    description: "Cool sea glass and teal.",
    scheme: "light",
  },
  {
    id: "sakura",
    label: "Sakura",
    description: "Soft blossom pinks and plum.",
    scheme: "light",
  },
  {
    id: "horror",
    label: "Horror",
    description: "Bone on charcoal, with blood.",
    scheme: "dark",
  },
  {
    id: "synthwave",
    label: "Synthwave",
    description: "Deep violet night and hot pink neon.",
    scheme: "dark",
  },
  {
    id: "terminal",
    label: "Terminal",
    description: "Green phosphor on black, in monospace.",
    scheme: "dark",
  },
] as const;

export const THEME_STORAGE_KEY = "drive-music-theme";

export const DEFAULT_PREFERENCE: ThemePreference = "system";

const THEMES_BY_ID = new Map(THEMES.map((theme) => [theme.id, theme]));

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || (typeof value === "string" && THEMES_BY_ID.has(value as ThemeId));
}

/** Collapses `"system"` down to a concrete theme using the OS preference. */
export function resolveTheme(
  preference: ThemePreference,
  prefersDark: boolean,
): ThemeDefinition {
  const id = preference === "system" ? (prefersDark ? "dark" : "light") : preference;
  // Non-null: every ThemeId is in the map, and "system" was just resolved to one of two literals.
  return THEMES_BY_ID.get(id)!;
}

export const PREFERS_DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * Source for the blocking `<head>` script that stamps the theme onto `<html>` while the browser
 * is still parsing — the only way to avoid a flash of the wrong theme, since the preference
 * lives in localStorage and the server can't know it. Generated from THEMES so the id → scheme
 * mapping can't drift from the registry.
 */
export function themeInitScript(): string {
  const schemes = Object.fromEntries(THEMES.map((theme) => [theme.id, theme.scheme]));
  // The scheme is re-checked against the two literals rather than trusted for truthiness: a
  // stored value of "constructor" or "toString" would otherwise find something on the map's
  // prototype chain and sail through.
  return `(function(){try{var s=${JSON.stringify(schemes)};var p=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});var c=p?s[p]:null;if(c!=="light"&&c!=="dark"){p=matchMedia(${JSON.stringify(PREFERS_DARK_QUERY)}).matches?"dark":"light";c=p}var e=document.documentElement;e.setAttribute("data-theme",p);e.setAttribute("data-scheme",c)}catch(_){}})()`;
}
