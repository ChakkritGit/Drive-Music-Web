import { Suspense } from "react";
import { LibraryView } from "@/components/LibraryView";
import { MusicPageSkeleton } from "@/components/LoadingSkeletons";

// LibraryView reads the search from the URL; the boundary keeps the page prerendered around it.
export default function Page() {
  return (
    <Suspense fallback={<MusicPageSkeleton view="library" />}>
      <LibraryView />
    </Suspense>
  );
}
