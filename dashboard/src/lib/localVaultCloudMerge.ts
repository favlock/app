import { buildFavLockExport, type FavLockExport } from "./dataExport";
import { decryptFieldStrict, VERIFY_CONSTANT } from "./encryption";
import { probeEncryptedData } from "./encryptionDataProbe";
import { fetchEncryptionVerifier } from "./encryptionMetadataApi";
import {
  readLocalBookmarks,
  readLocalEntries,
  readLocalFolders,
  readLocalLists,
  readLocalTags,
} from "./localVault";

const STORAGE_KEY = "favlock.local-cloud-merge.v1";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface LocalVaultCloudMergeIntent {
  sourceVaultId: string;
  migrationId: string;
  createdAt: string;
  strategy?: "adopt-local-key";
  completed?: true;
  adoptedLocalKey?: true;
}

export type LocalVaultCloudDestination =
  | "empty"
  | "same-key"
  | "same-key-without-verifier"
  | "different-key";

export async function inspectLocalVaultCloudDestination(
  sourceKey: CryptoKey,
  accessToken: string,
): Promise<LocalVaultCloudDestination> {
  const verifier = await fetchEncryptionVerifier(accessToken);
  if (verifier) {
    try {
      return await decryptFieldStrict(verifier, sourceKey) === VERIFY_CONSTANT
        ? "same-key"
        : "different-key";
    } catch {
      return "different-key";
    }
  }

  const probe = await probeEncryptedData(sourceKey, accessToken);
  if (probe === "empty") return "empty";
  return probe === "matches" ? "same-key-without-verifier" : "different-key";
}

export function startLocalVaultCloudMerge(
  sourceVaultId: string,
): LocalVaultCloudMergeIntent {
  if (!UUID_PATTERN.test(sourceVaultId)) {
    throw new Error("The local vault identifier is invalid.");
  }
  const intent = {
    sourceVaultId,
    migrationId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  } satisfies LocalVaultCloudMergeIntent;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(intent));
  return intent;
}

export function readLocalVaultCloudMerge(): LocalVaultCloudMergeIntent | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<LocalVaultCloudMergeIntent>;
    const createdAt = typeof value.createdAt === "string"
      ? Date.parse(value.createdAt)
      : Number.NaN;
    if (
      typeof value.sourceVaultId !== "string" ||
      !UUID_PATTERN.test(value.sourceVaultId) ||
      typeof value.migrationId !== "string" ||
      !UUID_PATTERN.test(value.migrationId) ||
      !Number.isFinite(createdAt) ||
      Date.now() - createdAt > MAX_AGE_MS ||
      createdAt - Date.now() > 5 * 60 * 1000
    ) {
      clearLocalVaultCloudMerge();
      return null;
    }
    return {
      sourceVaultId: value.sourceVaultId,
      migrationId: value.migrationId,
      createdAt: value.createdAt!,
      ...(value.strategy === "adopt-local-key"
        ? { strategy: value.strategy }
        : {}),
      ...(value.completed === true ? { completed: true as const } : {}),
      ...(value.completed === true && value.adoptedLocalKey === true
        ? { adoptedLocalKey: true as const }
        : {}),
    };
  } catch {
    clearLocalVaultCloudMerge();
    return null;
  }
}

export function markLocalVaultCloudMergeAdopting(
  intent: LocalVaultCloudMergeIntent,
): LocalVaultCloudMergeIntent {
  const current = readLocalVaultCloudMerge();
  if (
    !current ||
    current.sourceVaultId !== intent.sourceVaultId ||
    current.migrationId !== intent.migrationId
  ) {
    throw new Error("The local vault connection expired. Start again.");
  }
  const updated = { ...current, strategy: "adopt-local-key" } as const;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}

export function markLocalVaultCloudMergeCompleted(
  intent: LocalVaultCloudMergeIntent,
  adoptedLocalKey: boolean,
): LocalVaultCloudMergeIntent {
  const current = readLocalVaultCloudMerge();
  if (
    !current ||
    current.sourceVaultId !== intent.sourceVaultId ||
    current.migrationId !== intent.migrationId
  ) {
    throw new Error("The local vault connection expired. Start again.");
  }
  const updated: LocalVaultCloudMergeIntent = {
    ...current,
    completed: true,
    ...(adoptedLocalKey ? { adoptedLocalKey: true } : {}),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}

export function clearLocalVaultCloudMerge(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export async function buildLocalVaultMergeArchive(
  sourceVaultId: string,
  sourceKey: CryptoKey,
): Promise<FavLockExport> {
  const [bookmarks, folders, tags, entries, lists] = await Promise.all([
    readLocalBookmarks(sourceVaultId, sourceKey),
    readLocalFolders(sourceVaultId, sourceKey),
    readLocalTags(sourceVaultId, sourceKey),
    readLocalEntries(sourceVaultId, sourceKey),
    readLocalLists(sourceVaultId, sourceKey),
  ]);
  return buildFavLockExport(
    {
      bookmarks,
      folders,
      tags,
      lists,
      notes: entries.filter((entry) => entry.kind === "note"),
      todos: entries.filter((entry) => entry.kind === "todo"),
      readspace: entries.filter((entry) => entry.kind === "read"),
    },
    { bookmarks: true, notes: true, todos: true, readspace: true },
  );
}
