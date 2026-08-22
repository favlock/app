import { ENC_PREFIX, decryptFieldStrict } from "./encryption";
import {
  fetchEncryptedLibraryBookmarkSample,
  fetchEncryptedLibraryEntrySample,
  fetchEncryptedLibraryFolderSample,
  fetchEncryptedLibraryTagSample,
} from "./libraryContentApi";

function isEncryptedValue(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(ENC_PREFIX);
}

export async function canDecryptExistingData(
  key: CryptoKey,
  accessToken: string,
): Promise<boolean> {
  const bookmarks = await fetchEncryptedLibraryBookmarkSample(accessToken);

  for (const bookmark of bookmarks) {
    for (const value of [bookmark.encryptedTitle, bookmark.encryptedUrl]) {
      if (!isEncryptedValue(value)) continue;

      try {
        await decryptFieldStrict(value, key);
        return true;
      } catch {
        return false;
      }
    }
  }

  const folders = await fetchEncryptedLibraryFolderSample(accessToken);
  for (const folder of folders) {
    if (!isEncryptedValue(folder.encryptedName)) continue;

    try {
      await decryptFieldStrict(folder.encryptedName, key);
      return true;
    } catch {
      return false;
    }
  }

  const tags = await fetchEncryptedLibraryTagSample(accessToken);
  for (const tag of tags) {
    if (!isEncryptedValue(tag.encryptedName)) continue;

    try {
      await decryptFieldStrict(tag.encryptedName, key);
      return true;
    } catch {
      return false;
    }
  }

  const entries = await fetchEncryptedLibraryEntrySample(accessToken);
  for (const entry of entries) {
    for (const value of [entry.encryptedTitle, entry.encryptedContent]) {
      if (!isEncryptedValue(value)) continue;

      try {
        await decryptFieldStrict(value, key);
        return true;
      } catch {
        return false;
      }
    }
  }

  return false;
}
