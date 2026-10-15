"use client";

import { useEffect } from "react";
import { installPwaChrome } from "@/lib/pwa-chrome";

/** status bar colour + no zoom into small fields (lib/pwa-chrome.ts); renders nothing */
export function PwaChrome() {
  useEffect(() => installPwaChrome(), []);
  return null;
}
