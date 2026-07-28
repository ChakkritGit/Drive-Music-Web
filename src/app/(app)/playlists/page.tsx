"use client";

import { useRouter } from "next/navigation";
import { PlaylistsView } from "@/components/PlaylistsView";

export default function Page() {
  const router = useRouter();
  return (
    <PlaylistsView
      onOpen={(playlist) => router.push(`/playlists/${playlist.id}`)}
    />
  );
}
