"use client";

import { Check } from "lucide-react";
import clsx from "clsx";
import { useTheme } from "@/components/ThemeContext";
import { THEMES, type ThemeDefinition, type ThemePreference } from "@/lib/themes";

/**
 * A miniature of the app painted in one theme: page background, accent, a heading line, a muted
 * line. It works by scoping `data-theme`/`data-scheme` to this element — the same attributes the
 * theme script puts on <html> — so the swatch is literally the theme rendering itself, and no
 * palette has to be restated here to preview it.
 */
function ThemeSwatch({ theme }: { theme: ThemeDefinition }) {
  return (
    <div
      data-theme={theme.id}
      data-scheme={theme.scheme}
      // Decorative: without this the "Aa" lands in the enclosing button's accessible name,
      // which should just be the theme's.
      aria-hidden
      className="theme-font flex h-16 items-center gap-2.5 rounded-lg border border-zinc-200 bg-background px-3 dark:border-zinc-800"
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-semibold text-white">
        Aa
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="h-1.5 w-full rounded-full bg-zinc-900 dark:bg-zinc-100" />
        <span className="h-1.5 w-3/5 rounded-full bg-zinc-400" />
      </span>
    </div>
  );
}

export function ThemePicker() {
  const { preference, systemTheme, setPreference } = useTheme();

  const options: {
    value: ThemePreference;
    label: string;
    description: string;
    preview: ThemeDefinition;
  }[] = [
    {
      value: "system",
      label: "System",
      description: "Follow this device's light/dark setting.",
      // Previewed as whatever the OS says right now, which is what picking it would give you.
      preview: systemTheme,
    },
    ...THEMES.map((theme) => ({
      value: theme.id,
      label: theme.label,
      description: theme.description,
      preview: theme,
    })),
  ];

  return (
    <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
      {options.map((option) => {
        const selected = preference === option.value;
        return (
          <button
            key={option.value}
            onClick={() => setPreference(option.value)}
            aria-pressed={selected}
            className={clsx(
              "rounded-xl border p-2 text-left transition",
              selected
                ? "border-accent ring-2 ring-accent"
                : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700",
            )}
          >
            <ThemeSwatch theme={option.preview} />
            <div className="mt-2 flex items-center gap-1 px-0.5">
              <span className="truncate text-xs font-medium text-zinc-900 dark:text-zinc-50">
                {option.label}
              </span>
              {selected && <Check className="h-3.5 w-3.5 shrink-0 text-accent" />}
            </div>
            <p className="mt-0.5 px-0.5 text-[11px] text-zinc-400">{option.description}</p>
          </button>
        );
      })}
    </div>
  );
}
