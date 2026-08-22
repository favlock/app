import { useState } from "react";
import { Copy, KeyRound, LoaderCircle, QrCode } from "lucide-react";
import { useEncryption } from "../context/useEncryption";
import { exportRawKey, normalizeRawKey } from "../lib/encryption";
import { Button } from "./ui/button";
import { Text } from "./ui/text";

type TransferStatus = {
  type: "error" | "info";
  message: string;
};

function formatPortableKey(rawKey: string): string {
  const clean = normalizeRawKey(rawKey);
  return clean.match(/.{1,4}/g)?.join(" ") ?? clean;
}

async function createQrDataUrl(rawKey: string): Promise<string> {
  const { default: QRCode } = await import("qrcode");

  return QRCode.toDataURL(formatPortableKey(rawKey), {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 280,
    color: {
      dark: "#111827",
      light: "#ffffff",
    },
  });
}

export default function KeyTransferSection() {
  const { cryptoKey, keyLoading, triggerUnlock } = useEncryption();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [visibleKey, setVisibleKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<TransferStatus | null>(null);

  const showQrFromRawKey = async (rawKey: string) => {
    const dataUrl = await createQrDataUrl(rawKey);
    setQrDataUrl(dataUrl);
  };

  const exportCurrentKey = async (): Promise<string | null> => {
    setStatus(null);

    if (!cryptoKey) {
      triggerUnlock();
      setStatus({
        type: "info",
        message: "Unlock this browser first, then view your encryption key.",
      });
      return null;
    }

    setLoading(true);
    try {
      return await exportRawKey(cryptoKey);
    } catch {
      setStatus({
        type: "error",
        message:
          "This browser saved an older key that cannot be exported. Lock this browser, then unlock it with your key file to view or share your encryption key.",
      });
      return null;
    } finally {
      setLoading(false);
    }
  };

  const handleShowQr = async () => {
    const rawKey = await exportCurrentKey();
    if (rawKey) await showQrFromRawKey(rawKey);
  };

  const handleShowKey = async () => {
    const rawKey = await exportCurrentKey();
    if (rawKey) setVisibleKey(formatPortableKey(rawKey));
  };

  const handleCopyKey = async () => {
    if (!visibleKey) return;

    try {
      await navigator.clipboard.writeText(visibleKey);
      setStatus({ type: "info", message: "Encryption key copied to clipboard." });
    } catch {
      setStatus({
        type: "error",
        message: "Could not copy the encryption key. Copy it manually instead.",
      });
    }
  };

  return (
    <section className="rounded-2xl border border-gray-200/80 bg-white/80 p-4 shadow-sm   sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <KeyRound className="size-4 text-gray-500 " />
            <h3 className="text-sm font-semibold text-gray-900 ">
              Encryption key
            </h3>
          </div>
          <Text className="mt-1 text-sm text-gray-600 ">
            View your key or show a private QR to scan from another signed-in
            device.
          </Text>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            color="emerald"
            disabled={loading || keyLoading}
            onClick={() => {
              if (qrDataUrl) {
                setQrDataUrl(null);
                return;
              }

              void handleShowQr();
            }}
            className="cursor-pointer whitespace-nowrap"
          >
            {loading ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <QrCode className="size-4" />
            )}
            {qrDataUrl ? "Hide QR" : "Show QR"}
          </Button>
          <Button
            type="button"
            outline
            disabled={loading || keyLoading}
            onClick={() => {
              if (visibleKey) {
                setVisibleKey(null);
                return;
              }

              void handleShowKey();
            }}
            className="cursor-pointer whitespace-nowrap"
          >
            <KeyRound className="size-4" />
            {visibleKey ? "Hide key" : "Show key"}
          </Button>
        </div>
      </div>

      {status ? (
        <div
          role={status.type === "error" ? "alert" : "status"}
          aria-live="polite"
          className={`mt-4 rounded-xl px-4 py-3 text-sm ${
            status.type === "error"
              ? "bg-red-500/10 text-red-600 "
              : "bg-sky-500/10 text-sky-600 "
          }`}
        >
          {status.message}
        </div>
      ) : null}

      {visibleKey ? (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-mono text-sm font-bold tracking-wide break-all text-gray-900">
                {visibleKey}
              </p>
              <Text className="mt-2 text-sm text-gray-600 ">
                Keep this key private. Anyone with it can unlock your encrypted
                bookmarks.
              </Text>
            </div>
            <Button
              type="button"
              outline
              onClick={() => void handleCopyKey()}
              className="flex-none cursor-pointer whitespace-nowrap"
            >
              <Copy className="size-4" />
              Copy key
            </Button>
          </div>
        </div>
      ) : null}

      {qrDataUrl ? (
        <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="w-fit rounded-xl border border-gray-200 bg-white p-3 ">
            <img
              src={qrDataUrl}
              alt="Encryption key transfer QR code"
              className="size-56"
            />
          </div>
          <div className="min-w-0 flex-1">
            <Text className="text-sm text-gray-600 ">
              Keep this QR private. Anyone who scans it can unlock your
              encrypted bookmarks.
            </Text>
          </div>
        </div>
      ) : null}
    </section>
  );
}
