"use client";

import { usePathname } from "next/navigation";
import { loadingView, MusicPageSkeleton } from "@/components/LoadingSkeletons";

export default function Loading() {
  return <MusicPageSkeleton view={loadingView(usePathname())} />;
}
