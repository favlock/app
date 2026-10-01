import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getFirefoxExtensionOrigin, parseFirefoxBookmarksTree } from "../lib/firefoxBookmarkImport";
import type { BrowserBookmarkImportResult } from "../lib/browserBookmarkImport";
import { Button } from "./ui/button";

type Props = {
  disabled: boolean;
  onImport: (result: BrowserBookmarkImportResult) => Promise<void>;
};

export default function FirefoxBookmarkImportControl({ disabled, onImport }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const origin = getFirefoxExtensionOrigin(location.search);
  const iframe = useRef<HTMLIFrameElement>(null);
  const pending = useRef<string | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoStarted = useRef(false);
  const [ready, setReady] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestImport = useCallback(() => {
    if (!origin || !iframe.current?.contentWindow || disabled || !ready || pending.current) return;
    const requestId = crypto.randomUUID();
    pending.current = requestId;
    setReading(true);
    setError(null);
    timeout.current = setTimeout(() => {
      pending.current = null;
      setReading(false);
      setError("Firefox did not respond. Reload the extension and open import again.");
    }, 10_000);
    iframe.current.contentWindow.postMessage({ type: "FAVLOCK_FIREFOX_BOOKMARKS_REQUEST", requestId }, origin);
  }, [disabled, origin, ready]);

  useEffect(() => {
    setReady(false);
    autoStarted.current = false;
  }, [origin]);

  useEffect(() => {
    if (!origin) return;
    const receive = (event: MessageEvent) => {
      if (event.origin !== origin || event.source !== iframe.current?.contentWindow) return;
      if (event.data?.type === "FAVLOCK_FIREFOX_EXTENSION_READY") {
        setReady(true);
        return;
      }
      if (!pending.current || event.data?.type !== "FAVLOCK_FIREFOX_BOOKMARKS_RESULT" || event.data.requestId !== pending.current) return;
      pending.current = null;
      if (timeout.current) clearTimeout(timeout.current);
      setReading(false);
      if (typeof event.data.error === "string") { setError(event.data.error); return; }
      if (disabled) return;
      try {
        void onImport(parseFirefoxBookmarksTree(event.data.tree)).catch(() => setError("Could not preview Firefox bookmarks."));
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Invalid Firefox bookmarks.");
      }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [disabled, onImport, origin]);

  useEffect(() => () => { if (timeout.current) clearTimeout(timeout.current); }, []);

  useEffect(() => {
    if (new URLSearchParams(location.search).get("autoImport") !== "firefox" || autoStarted.current || disabled || !ready) return;
    autoStarted.current = true;
    const params = new URLSearchParams(location.search);
    params.delete("autoImport");
    navigate({ pathname: location.pathname, search: `?${params}`, hash: location.hash }, { replace: true });
    requestImport();
  }, [disabled, location, navigate, ready, requestImport]);

  if (!origin) return null;
  return <div className="mt-4">
    <iframe ref={iframe} src={`${origin}/bookmark-import-bridge.html`} title="FavLock Firefox bookmark importer" className="hidden" tabIndex={-1}
      onLoad={() => iframe.current?.contentWindow?.postMessage({ type: "FAVLOCK_FIREFOX_EXTENSION_PING" }, origin)} />
    <Button type="button" outline disabled={disabled || !ready || reading} onClick={requestImport}>
      {reading ? "Reading Firefox bookmarks…" : "Import from Firefox"}
    </Button>
    {error && <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
  </div>;
}
