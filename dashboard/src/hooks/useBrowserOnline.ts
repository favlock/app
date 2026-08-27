import { useSyncExternalStore } from "react";
import { isBrowserOnline } from "../lib/network";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function useBrowserOnline(): boolean {
  return useSyncExternalStore(subscribe, isBrowserOnline, () => true);
}
