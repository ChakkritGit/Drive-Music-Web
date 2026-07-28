"use client";

import { useParams, useRouter } from "next/navigation";
import { usePlaylists } from "@/components/PlaylistsContext";
import { PlaylistDetail } from "@/components/PlaylistDetail";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { playlists } = usePlaylists();
  const playlist = playlists.find((p) => p.id === id);

  if (!playlist) {
    return (
      <p className="mx-auto max-w-2xl px-6 py-10 text-sm text-zinc-400">
        Playlist not found.
      </p>
    );
  }

  return (
    <PlaylistDetail
      playlist={playlist}
      onBack={() => router.push("/playlists")}
    />
  );
}
