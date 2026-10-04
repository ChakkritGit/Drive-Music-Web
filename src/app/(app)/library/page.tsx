import { Suspense } from "react";
import { LibraryView } from "@/components/LibraryView";

// LibraryView reads the search from the URL; the boundary keeps the page prerendered around it.
export default function Page() {
  return (
    <Suspense>
      <LibraryView />
    </Suspense>
  );
}
