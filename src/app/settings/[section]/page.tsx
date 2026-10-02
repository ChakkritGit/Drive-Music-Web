import { notFound } from "next/navigation";
import { SettingsShell } from "@/components/settings/SettingsShell";
import { SETTINGS_SECTIONS, findSection } from "@/components/settings/sections";

export function generateStaticParams() {
  return SETTINGS_SECTIONS.map(({ id }) => ({ section: id }));
}

export default async function SettingsSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section: id } = await params;
  const section = findSection(id);
  if (!section) notFound();

  return (
    <SettingsShell title={section.title} backHref="/settings" backLabel="Settings">
      <section.Component />
    </SettingsShell>
  );
}
