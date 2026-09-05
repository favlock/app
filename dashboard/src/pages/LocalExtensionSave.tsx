import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, LoaderCircle, ShieldAlert } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { useEncryption } from "../context/useEncryption";
import { decryptFieldStrict } from "../lib/encryption";
import {
  isAllowedFavLockExtensionId,
  sendLocalProjectionToExtension,
} from "../lib/extensionPairing";
import {
  createLocalExtensionBookmark,
  readLocalExtensionProjection,
} from "../lib/localVault";
import { Button } from "../components/ui/button";

const EXTENSION_READY = "FAVLOCK_CHROME_EXTENSION_READY";
const EXTENSION_PING = "FAVLOCK_CHROME_EXTENSION_PING";
const CAPTURE_REQUEST = "FAVLOCK_LOCAL_BOOKMARK_CAPTURE_REQUEST";
const CAPTURE_RESULT = "FAVLOCK_LOCAL_BOOKMARK_CAPTURE_RESULT";
const CAPTURE_DELETE = "FAVLOCK_LOCAL_BOOKMARK_CAPTURE_DELETE";
const CAPTURE_ID_PATTERN = /^[0-9a-f-]{20,64}$/i;

type LocalBookmarkCapture = {
  version: 1;
  userId: string;
  existingBookmarkId: string | null;
  encryptedTitle: string;
  encryptedUrl: string;
  folderId: string | null;
  selectedListIds: string[];
  existingTagIds: string[];
  encryptedNewCollectionName: string | null;
  encryptedNewListName: string | null;
  newEncryptedTagNames: string[];
  createdAt: string;
};

export default function LocalExtensionSave() {
  const [searchParams] = useSearchParams();
  const { user, isLocalAccount, retryBookmarkCacheSync } = useAuth();
  const { cryptoKey, triggerUnlock } = useEncryption();
  const queryClient = useQueryClient();
  const bridgeRef = useRef<HTMLIFrameElement>(null);
  const requestIdRef = useRef<string | null>(null);
  const saveStartedRef = useRef(false);
  const [bridgeReady, setBridgeReady] = useState(false);
  const [capture, setCapture] = useState<LocalBookmarkCapture | null>(null);
  const [status, setStatus] = useState<"loading" | "saved" | "error">("loading");
  const [message, setMessage] = useState("Receiving the encrypted bookmark from Chrome…");
  const [savedTitle, setSavedTitle] = useState("");

  const captureId = CAPTURE_ID_PATTERN.test(searchParams.get("capture") ?? "")
    ? searchParams.get("capture")!
    : null;
  const extensionId = searchParams.get("chromeExtensionId");
  const configuredExtensionId = import.meta.env.VITE_CHROME_EXTENSION_ID;
  const trustedExtensionId = isAllowedFavLockExtensionId(
    extensionId,
    configuredExtensionId,
  ) ? extensionId : null;
  const extensionOrigin = useMemo(
    () => trustedExtensionId ? `chrome-extension://${trustedExtensionId}` : null,
    [trustedExtensionId],
  );

  useEffect(() => {
    if (!captureId || !extensionOrigin) {
      setStatus("error");
      setMessage("This local save request is invalid. Start again from the FavLock extension.");
    } else if (!isLocalAccount) {
      setStatus("error");
      setMessage("This handoff belongs to a local vault. Switch back to that local vault and try again.");
    }
  }, [captureId, extensionOrigin, isLocalAccount]);

  useEffect(() => {
    if (!extensionOrigin) return;
    const receive = (event: MessageEvent) => {
      if (
        event.origin !== extensionOrigin ||
        event.source !== bridgeRef.current?.contentWindow
      ) return;
      if (event.data?.type === EXTENSION_READY) {
        setBridgeReady(true);
        return;
      }
      if (
        event.data?.type !== CAPTURE_RESULT ||
        event.data?.requestId !== requestIdRef.current
      ) return;
      requestIdRef.current = null;
      if (!event.data.capture) {
        setStatus("error");
        setMessage("Chrome no longer has this encrypted bookmark capture. Save the page again.");
        return;
      }
      setCapture(event.data.capture as LocalBookmarkCapture);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [extensionOrigin]);

  useEffect(() => {
    if (!extensionOrigin || !bridgeRef.current?.contentWindow) return;
    bridgeRef.current.contentWindow.postMessage({ type: EXTENSION_PING }, extensionOrigin);
  }, [extensionOrigin]);

  useEffect(() => {
    if (!bridgeReady || !captureId || !extensionOrigin || !bridgeRef.current?.contentWindow) return;
    const requestId = crypto.randomUUID();
    requestIdRef.current = requestId;
    bridgeRef.current.contentWindow.postMessage(
      { type: CAPTURE_REQUEST, captureId, requestId },
      extensionOrigin,
    );
    const timeout = window.setTimeout(() => {
      if (requestIdRef.current !== requestId) return;
      requestIdRef.current = null;
      setStatus("error");
      setMessage("Chrome did not return the encrypted bookmark. Reload the extension and try again.");
    }, 10_000);
    return () => window.clearTimeout(timeout);
  }, [bridgeReady, captureId, extensionOrigin]);

  useEffect(() => {
    if (!capture || !captureId || !extensionOrigin || !trustedExtensionId || !user || saveStartedRef.current) return;
    if (!cryptoKey) {
      triggerUnlock();
      setMessage("Unlocking your local vault…");
      return;
    }
    saveStartedRef.current = true;
    void (async () => {
      try {
        if (capture.userId !== user.id) {
          throw new Error("The extension is paired with another local vault.");
        }
        const createdAt = Date.parse(capture.createdAt);
        if (!Number.isFinite(createdAt) || Math.abs(Date.now() - createdAt) > 10 * 60 * 1000) {
          throw new Error("This local save request expired. Save the page again from Chrome.");
        }
        const [title, url] = await Promise.all([
          decryptFieldStrict(capture.encryptedTitle, cryptoKey),
          decryptFieldStrict(capture.encryptedUrl, cryptoKey),
        ]);
        const parsedUrl = new URL(url);
        if (!["http:", "https:"].includes(parsedUrl.protocol)) {
          throw new Error("This capture does not contain a supported bookmark URL.");
        }
        await createLocalExtensionBookmark(user.id, {
          existingBookmarkId: capture.existingBookmarkId,
          encryptedTitle: capture.encryptedTitle,
          encryptedUrl: capture.encryptedUrl,
          folderId: capture.folderId,
          selectedListIds: capture.selectedListIds,
          existingTagIds: capture.existingTagIds,
          encryptedNewCollectionName: capture.encryptedNewCollectionName,
          encryptedNewListName: capture.encryptedNewListName,
          newEncryptedTagNames: capture.newEncryptedTagNames,
        });
        let projectionRefreshed = true;
        try {
          const projection = await readLocalExtensionProjection(user.id);
          await sendLocalProjectionToExtension({
            extensionId: trustedExtensionId,
            userId: user.id,
            projection,
          });
        } catch {
          projectionRefreshed = false;
        }
        bridgeRef.current?.contentWindow?.postMessage(
          { type: CAPTURE_DELETE, captureId },
          extensionOrigin,
        );
        retryBookmarkCacheSync();
        for (const queryKey of [["bookmarks"], ["folders"], ["tags"], ["lists"]]) {
          void queryClient.invalidateQueries({ queryKey });
        }
        setSavedTitle(title.trim() || parsedUrl.hostname);
        setStatus("saved");
        setMessage(
          projectionRefreshed
            ? "Saved encrypted in this browser. Nothing was sent to FavLock cloud."
            : "Saved encrypted in this browser. Reconnect the extension to refresh its local search index.",
        );
      } catch (error) {
        saveStartedRef.current = false;
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "FavLock could not save this bookmark locally.");
      }
    })();
  }, [capture, captureId, cryptoKey, extensionOrigin, queryClient, retryBookmarkCacheSync, triggerUnlock, trustedExtensionId, user]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl items-center px-5 py-12">
      {extensionOrigin ? (
        <iframe
          ref={bridgeRef}
          src={`${extensionOrigin}/bookmark-import-bridge.html`}
          title="FavLock local bookmark bridge"
          className="hidden"
          tabIndex={-1}
          onLoad={() => {
            bridgeRef.current?.contentWindow?.postMessage(
              { type: EXTENSION_PING },
              extensionOrigin,
            );
          }}
        />
      ) : null}
      <section className="w-full rounded-2xl border border-[var(--app-line)] bg-[var(--app-card)] p-6 text-center shadow-sm">
        {status === "saved" ? (
          <CheckCircle2 className="mx-auto size-10 text-emerald-600" aria-hidden="true" />
        ) : status === "error" ? (
          <ShieldAlert className="mx-auto size-10 text-amber-600" aria-hidden="true" />
        ) : (
          <LoaderCircle className="mx-auto size-10 animate-spin text-[var(--app-primary)]" aria-hidden="true" />
        )}
        <h1 className="mt-4 text-xl font-semibold text-[var(--app-ink)]">
          {status === "saved" ? `Saved “${savedTitle}”` : status === "error" ? "Local save needs attention" : "Saving to your local vault"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]" role="status">
          {message}
        </p>
        <Button className="mt-6" color="emerald" href="/">
          Return to library
        </Button>
      </section>
    </div>
  );
}
