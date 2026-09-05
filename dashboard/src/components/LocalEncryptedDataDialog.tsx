import { useEffect, useState } from "react";
import { Database, LockKeyhole } from "lucide-react";
import {
  readLocalEncryptedPreview,
  type LocalEncryptedPreviewItem,
} from "../lib/localVault";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";

interface LocalEncryptedDataDialogProps {
  open: boolean;
  vaultId: string;
  onClose: () => void;
}

export default function LocalEncryptedDataDialog({
  open,
  vaultId,
  onClose,
}: LocalEncryptedDataDialogProps) {
  const [items, setItems] = useState<LocalEncryptedPreviewItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError(null);
    void readLocalEncryptedPreview(vaultId)
      .then((preview) => {
        if (active) setItems(preview);
      })
      .catch(() => {
        if (active) {
          setItems([]);
          setError("Could not inspect the encrypted local vault.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, vaultId]);

  return (
    <Dialog open={open} onClose={onClose} size="2xl">
      <DialogTitle>How your encrypted data looks</DialogTitle>
      <DialogDescription>
        This is the actual ciphertext stored in this browser. FavLock decrypts
        it in memory only while your local vault is unlocked.
      </DialogDescription>
      <DialogBody>
        <div className="rounded-xl border border-emerald-600/20 bg-emerald-500/8 p-4">
          <div className="flex gap-3">
            <LockKeyhole
              className="mt-0.5 size-5 shrink-0 text-emerald-700"
              aria-hidden="true"
            />
            <p className="text-sm leading-6 text-emerald-950">
              Titles, URLs, Collection names, and Tag names are encrypted.
              Timestamps, relationships, counts, and favorite state remain
              visible metadata so the app can organize the vault.
            </p>
          </div>
        </div>

        {loading ? (
          <p className="mt-5 text-sm text-zinc-600" role="status">
            Reading encrypted records…
          </p>
        ) : error ? (
          <p
            className="mt-5 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-700"
            role="alert"
          >
            {error}
          </p>
        ) : items.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed border-zinc-300 px-5 py-8 text-center">
            <Database className="mx-auto size-6 text-zinc-500" aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold text-zinc-900">
              No encrypted records yet
            </p>
            <p className="mt-1 text-sm text-zinc-600">
              Save a bookmark, Collection, or Tag and open this view again.
            </p>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <p className="text-sm leading-6 text-zinc-600">
              For readability, this view shows only a limited sample.
            </p>
            {items.map((item, itemIndex) => (
              <section
                key={`${item.kind}-${itemIndex}`}
                className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4"
              >
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-500">
                  {item.kind}
                </p>
                <dl className="mt-3 space-y-3">
                  {item.protectedFields.map((field) => (
                    <div key={field.label}>
                      <dt className="text-xs font-semibold text-zinc-700">
                        Encrypted {field.label}
                      </dt>
                      <dd className="mt-1 max-h-24 overflow-y-auto break-all rounded-lg bg-zinc-950 px-3 py-2 font-mono text-xs leading-5 text-emerald-300">
                        {field.ciphertext}
                      </dd>
                    </div>
                  ))}
                </dl>
                <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600">
                  {item.metadata.map((field) => (
                    <div key={field.label} className="flex gap-1">
                      <dt className="font-semibold">{field.label}:</dt>
                      <dd>{field.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        )}
      </DialogBody>
      <DialogActions>
        <Button type="button" color="zinc" onClick={onClose}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
