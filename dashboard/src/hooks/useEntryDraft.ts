import { useCallback, useEffect, useRef, useState } from "react";
import {
  openEntryDraftLease, readEntryDrafts, removeEntryDraft, saveEntryDraft,
  type DraftLease, type EntryDraft, type EntryDraftFields,
} from "../lib/entryDrafts";

type DraftSession = { lease: DraftLease; key: CryptoKey; id: string; active: boolean };

export function useEntryDraft({ userId, cryptoKey, kind, initialEntryId, entryId, fields, dirty }: {
  userId?: string;
  cryptoKey: CryptoKey | null;
  kind: string;
  initialEntryId?: string;
  entryId?: string;
  fields: EntryDraftFields;
  dirty: boolean;
}) {
  const [session, setSession] = useState<DraftSession | null>(null);
  const [recovery, setRecovery] = useState<EntryDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [persisted, setPersisted] = useState<{ snapshot: string; entryId: string | null } | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const snapshot = JSON.stringify(fields);

  useEffect(() => {
    if (!userId || !cryptoKey) {
      setSession(null);
      setRecovery([]);
      setLoading(false);
      return;
    }
    let active = true;
    let opened: DraftSession | undefined;
    setLoading(true);
    void (async () => {
      try {
        const lease = await openEntryDraftLease(userId);
        const found = await readEntryDrafts(userId, kind, initialEntryId ?? null, cryptoKey);
        if (!active) return;
        opened = { lease, key: cryptoKey, id: crypto.randomUUID(), active: true };
        setSession(opened);
        setRecovery(found.drafts);
        setError(found.unreadable ? "A local draft could not be decrypted. It has been kept on this device." : null);
      } catch {
        if (active) setError("Local draft recovery is unavailable. Keep this editor open until you save.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
      if (opened) opened.active = false;
    };
  }, [userId, cryptoKey, kind, initialEntryId]);

  const persist = useCallback(async (value: string): Promise<boolean> => {
    if (!session?.active) return false;
    const operation = queue.current.catch(() => {}).then(async () => {
      if (!session.active) return false;
      await saveEntryDraft(session.lease, {
        id: session.id, userId: session.lease.userId, kind,
        entryId: entryId ?? null, updatedAt: Date.now(),
        fields: JSON.parse(value) as EntryDraftFields,
      }, session.key);
      if (session.active) {
        setPersisted({ snapshot: value, entryId: entryId ?? null });
        setError(null);
      }
      return true;
    });
    queue.current = operation;
    try {
      return await operation;
    } catch {
      if (session.active) setError("Could not keep a local draft. Save to your account or copy your writing before closing.");
      return false;
    }
  }, [session, kind, entryId]);

  useEffect(() => {
    if (!session?.active) return;
    if (!dirty) {
      const operation = queue.current.catch(() => {}).then(async () => {
        if (!session.active) return;
        await removeEntryDraft(session.lease, session.id);
        if (session.active) setPersisted(null);
      });
      queue.current = operation;
      void operation.catch(() => {
        if (session.active) setError("An older local draft could not be cleared.");
      });
      return;
    }
    const timer = window.setTimeout(() => { void persist(snapshot); }, 300);
    return () => window.clearTimeout(timer);
  }, [session, dirty, snapshot, persist]);

  const discardRecovery = useCallback(async (draft: EntryDraft) => {
    if (!session?.active) return false;
    try {
      await removeEntryDraft(session.lease, draft.id, draft.updatedAt);
      if (session.active) setRecovery((current) => current.filter((item) => item.id !== draft.id));
      return true;
    } catch {
      if (session.active) setError("Could not clear that local draft. It may have changed in another window; reopen the editor to try again.");
      return false;
    }
  }, [session]);

  return {
    recovery, loading, error,
    localSaved: dirty && persisted?.snapshot === snapshot && persisted.entryId === (entryId ?? null),
    flush: () => persist(snapshot),
    // Copy into this session's separate slot before removing a recovered draft.
    adopt: async (draft: EntryDraft) => {
      if (!await persist(JSON.stringify(draft.fields))) return false;
      return discardRecovery(draft);
    },
    discardRecovery,
  };
}
