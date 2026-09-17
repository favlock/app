import {
  deleteEncryptedFile,
  reserveEncryptedFile,
  uploadEncryptedFile,
  type EncryptedFileRecord,
} from "./filesApi";
import { encryptFile } from "./fileEncryption";

export async function uploadFile(
  file: File,
  masterKey: CryptoKey,
  accessToken: string,
  onPhase?: (phase: "encrypting" | "uploading") => void,
  signal?: AbortSignal,
): Promise<string> {
  onPhase?.("encrypting");
  const fileId = crypto.randomUUID();
  const encrypted = await encryptFile(file, masterKey, fileId, signal);
  signal?.throwIfAborted();
  try {
    await reserveEncryptedFile(accessToken, {
      fileId,
      encryptedMetadata: encrypted.encryptedMetadata,
      wrappedKey: encrypted.wrappedKey,
      ciphertextBytes: encrypted.ciphertext.size,
      formatVersion: encrypted.formatVersion,
    });

    signal?.throwIfAborted();
    onPhase?.("uploading");
    await uploadEncryptedFile(accessToken, fileId, encrypted.ciphertext, signal);
    signal?.throwIfAborted();
    return fileId;
  } catch (error) {
    await deleteEncryptedFile(accessToken, fileId).catch(() => undefined);
    throw error;
  }
}

export async function deleteFile(
  file: Pick<EncryptedFileRecord, "id">,
  accessToken: string,
): Promise<void> {
  await deleteEncryptedFile(accessToken, file.id);
}
