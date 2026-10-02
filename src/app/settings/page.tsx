"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { SettingsShell } from "@/components/settings/SettingsShell";
import { SETTINGS_SECTIONS } from "@/components/settings/sections";
import { sectionSummary } from "@/components/settings/summary";
import { usePlayer } from "@/components/PlayerContext";
import { useTheme } from "@/components/ThemeContext";

export default function SettingsPage() {
  return (
    <SettingsShell title="Settings" backHref="/" backLabel="Back">
      <SettingsList />
    </SettingsShell>
  );
}

// Inside the shell so usePlayer only runs once signed in, same as the old SettingsView.
function SettingsList() {
  const player = usePlayer();
  const { preference, theme } = useTheme();
  const themeLabel = preference === "system" ? "System" : theme.label;

  return (
    <div className="divide-y divide-zinc-200 overflow-hidden rounded-2xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
      {SETTINGS_SECTIONS.map(({ id, title, icon: Icon }) => (
        <Link
          key={id}
          href={`/settings/${id}`}
          className="flex min-h-14 items-center gap-3 px-4 py-3 transition hover:bg-zinc-50 dark:hover:bg-zinc-900"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-zinc-100 dark:bg-zinc-900">
            <Icon className="h-4 w-4 text-zinc-600 dark:text-zinc-300" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-50">{title}</span>
            <span className="block truncate text-xs text-zinc-400">
              {sectionSummary(id, player, themeLabel)}
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
        </Link>
      ))}
    </div>
  );
}
