import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Cloud, Eye, HardDrive } from "lucide-react";
import { LOCAL_BOOKMARK_LIMIT } from "../lib/localVault";
import { startLocalVaultCloudMerge } from "../lib/localVaultCloudMerge";
import LocalEncryptedDataDialog from "./LocalEncryptedDataDialog";

export default function LocalVaultBanner({
  bookmarkCount,
  vaultId,
}: {
  bookmarkCount: number;
  vaultId: string;
}) {
  const [showEncryptedData, setShowEncryptedData] = useState(false);
  const navigate = useNavigate();
  return (
    <>
      <section
        aria-label="Local vault"
        className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/25 bg-amber-50/85 px-4 py-3 text-amber-950 shadow-sm"
      >
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15">
            <HardDrive className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold">Stored only on this device</p>
            <p className="mt-0.5 text-xs leading-5 text-amber-900/75">
              Your encrypted local vault is not synced. {bookmarkCount} of{" "}
              {LOCAL_BOOKMARK_LIMIT} bookmarks used. Create a free account or
              sign in to sync it.
            </p>
          </div>
        </div>
        <div className="flex w-full shrink-0 flex-col gap-2 sm:flex-row sm:justify-end xl:w-auto">
          <button
            type="button"
            onClick={() => setShowEncryptedData(true)}
            className="inline-flex min-h-10 min-w-0 items-center justify-center gap-2 rounded-xl border border-amber-900/20 bg-white/65 px-4 py-2 text-sm font-semibold text-amber-950 transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-amber-700 focus:ring-offset-2"
          >
            <Eye className="size-4" aria-hidden="true" />
            View encrypted data
          </button>
          <button
            type="button"
            onClick={() => {
              startLocalVaultCloudMerge(vaultId);
              navigate("/login?mode=sign-in&reconnect=1&merge=1");
            }}
            className="inline-flex min-h-10 min-w-0 items-center justify-center gap-2 rounded-xl bg-amber-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-900 focus:outline-none focus:ring-2 focus:ring-amber-700 focus:ring-offset-2"
          >
            <Cloud className="size-4" aria-hidden="true" />
            Sync with an account
          </button>
        </div>
      </section>
      <LocalEncryptedDataDialog
        open={showEncryptedData}
        vaultId={vaultId}
        onClose={() => setShowEncryptedData(false)}
      />
    </>
  );
}
