import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  importRawKey,
  encryptField as enc,
  decryptField as dec,
  decryptFieldStrict,
  normalizeRawKey,
  STORAGE_KEY,
  VERIFY_CONSTANT,
  saveKeyToIDB,
  loadKeyFromIDB,
  deleteKeyFromIDB,
} from "../lib/encryption";
import { favLockAuth } from "../lib/favLockAuth";
import {
  fetchEncryptionVerifier,
  saveEncryptionVerifier,
} from "../lib/encryptionMetadataApi";
import { canDecryptExistingData } from "../lib/encryptionDataProbe";
import { createLocalKeyVerifier, matchesLocalKey, readLocalKeyVerifier, saveLocalKeyVerifier } from "../lib/localKeyVerifier";

interface EncryptionContextType {
  cryptoKey: CryptoKey | null;
  keyLoading: boolean;
  keyRemembered: boolean;
  needsUnlock: boolean;
  triggerUnlock: () => void;
  setRawKey: (
    raw: string,
    options?: { rememberDevice?: boolean },
  ) => Promise<void>;
  setKeyRemembered: (rememberDevice: boolean) => Promise<void>;
  lockKey: () => void;
  clearKey: () => Promise<void>;
  adoptMigratedKey: (
    key: CryptoKey,
    options?: { rememberDevice?: boolean },
  ) => Promise<boolean>;
  encryptField: (text: string) => Promise<string>;
  decryptField: (text: string) => Promise<string>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const EncryptionContext = createContext<
  EncryptionContextType | undefined
>(undefined);

export function EncryptionProvider({ children }: { children: ReactNode }) {
  const [cryptoKey, setCryptoKey] = useState<CryptoKey | null>(null);
  const [keyLoading, setKeyLoading] = useState(true);
  const [keyRemembered, setKeyRememberedState] = useState(false);
  const [needsUnlock, setNeedsUnlock] = useState(false);
  const keyGeneration = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const generation = keyGeneration.current;
    void (async () => {
      // Migrate from localStorage
      if (localStorage.getItem(STORAGE_KEY)) {
        localStorage.removeItem(STORAGE_KEY);
      }

      // Migrate from sessionStorage → IDB
      const raw = sessionStorage.getItem(STORAGE_KEY);
      await favLockAuth.getSession();
      const userId = favLockAuth.getLocalUser()?.id;
      if (!userId) return;
      const key = raw ? await importRawKey(raw) : await loadKeyFromIDB();
      const current = () => !cancelled && generation === keyGeneration.current && favLockAuth.getLocalUser()?.id === userId;
      if (!current()) return;
      if (key) {
        if (readLocalKeyVerifier(userId) && !await matchesLocalKey(userId, key)) return;
        const verifier = await createLocalKeyVerifier(key);
        if (!current()) return;
        saveLocalKeyVerifier(userId, verifier);
        if (raw) {
          await saveKeyToIDB(key, () => { if (!current()) throw new Error("Key loading was cancelled."); });
          if (current() && sessionStorage.getItem(STORAGE_KEY) === raw) sessionStorage.removeItem(STORAGE_KEY);
        }
        if (!current()) return;
      }
      setCryptoKey(key);
      setKeyRememberedState(!!key);
    })()
      .catch(() => { console.error("Could not load the saved encryption key. Check this browser's storage settings."); })
      .finally(() => { if (!cancelled) setKeyLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const triggerUnlock = useCallback(() => setNeedsUnlock(true), []);

  const setRawKey = useCallback(async (
      raw: string,
      options?: { rememberDevice?: boolean },
    ) => {
    const generation = keyGeneration.current;
    const userId = favLockAuth.getLocalUser()?.id;
    if (!userId) throw new Error("Open your local account before unlocking.");
    const assertCurrent = () => {
      if (generation !== keyGeneration.current || favLockAuth.getLocalUser()?.id !== userId) throw new Error("The local account changed. Unlock again.");
    };
    const clean = normalizeRawKey(raw);
    const key = await importRawKey(clean);

    const {
      data: { session },
    } = await favLockAuth.getSession();
    if (session && favLockAuth.getCloudStatus() === "available") {
      let savedVerifier: string | null;
      try {
        savedVerifier = await fetchEncryptionVerifier(session.access_token);
      } catch {
        throw new Error("Could not check encryption setup. Please try again.");
      }

      if (savedVerifier) {
        let verifierMatches = false;

        try {
          verifierMatches =
            (await decryptFieldStrict(savedVerifier, key)) === VERIFY_CONSTANT;
        } catch {
          verifierMatches = false;
        }

        if (!verifierMatches) {
          const decryptsExistingData = await canDecryptExistingData(
            key,
            session.access_token,
          );
          if (!decryptsExistingData) {
            throw new Error("This key does not match your encrypted data.");
          }

          const verifier = await enc(VERIFY_CONSTANT, key);
          try {
            await saveEncryptionVerifier(session.access_token, verifier);
          } catch {
            throw new Error("Key works, but the verifier could not be repaired.");
          }
        }
      } else {
        // First time setting a key — create the verifier
        const verifier = await enc(VERIFY_CONSTANT, key);
        try {
          await saveEncryptionVerifier(session.access_token, verifier);
        } catch {
          throw new Error("Could not save the encryption key verifier.");
        }
      }
    }

    if ((!session || favLockAuth.getCloudStatus() !== "available") && !await matchesLocalKey(userId, key)) {
      throw new Error(readLocalKeyVerifier(userId)
        ? "This key does not match your saved local library."
        : "This device has no saved key verifier. Reconnect once to verify your key; no local data was changed.");
    }
    const localVerifier = await createLocalKeyVerifier(key);
    assertCurrent();
    saveLocalKeyVerifier(userId, localVerifier);
    if (options?.rememberDevice) {
      await saveKeyToIDB(key, assertCurrent);
    } else {
      await deleteKeyFromIDB(assertCurrent);
    }
    assertCurrent();
    setCryptoKey(key);
    setKeyRememberedState(!!options?.rememberDevice);
    setNeedsUnlock(false);
    }, []);

  const setKeyRemembered = useCallback(async (rememberDevice: boolean) => {
    const generation = keyGeneration.current;
    const userId = favLockAuth.getLocalUser()?.id;
    const assertCurrent = () => {
      if (!userId || generation !== keyGeneration.current || favLockAuth.getLocalUser()?.id !== userId) throw new Error("The account changed. Unlock again.");
    };
    if (rememberDevice) {
      if (!cryptoKey) {
        throw new Error("Unlock encryption before remembering this device.");
      }
      await saveKeyToIDB(cryptoKey, assertCurrent);
    } else {
      await deleteKeyFromIDB(assertCurrent);
    }
    assertCurrent();
    setKeyRememberedState(rememberDevice);
  }, [cryptoKey]);

  const lockKey = useCallback(() => {
    keyGeneration.current += 1;
    setCryptoKey(null);
    setKeyRememberedState(false);
    setNeedsUnlock(false);
  }, []);

  const clearKey = useCallback(async () => {
    lockKey();
    await deleteKeyFromIDB();
  }, [lockKey]);

  const adoptMigratedKey = useCallback(
    async (
      key: CryptoKey,
      options?: { rememberDevice?: boolean },
    ): Promise<boolean> => {
      const rememberDevice = options?.rememberDevice ?? true;
      const userId = favLockAuth.getLocalUser()?.id;
      const generation = keyGeneration.current;
      if (!userId) return false;
      const assertCurrent = () => {
        if (generation !== keyGeneration.current || favLockAuth.getLocalUser()?.id !== userId) throw new Error("The account changed. Unlock again.");
      };
      const verifier = await createLocalKeyVerifier(key);
      if (generation !== keyGeneration.current || favLockAuth.getLocalUser()?.id !== userId) return false;
      saveLocalKeyVerifier(userId, verifier);
      setCryptoKey(key);
      setNeedsUnlock(false);

      try {
        if (rememberDevice) {
          await saveKeyToIDB(key, assertCurrent);
        } else {
          await deleteKeyFromIDB(assertCurrent);
        }
        assertCurrent();
        setKeyRememberedState(rememberDevice);
        return rememberDevice;
      } catch {
        setKeyRememberedState(false);
        return false;
      }
    },
    [],
  );

  const encryptField = useCallback(async (text: string): Promise<string> => {
    if (!cryptoKey) {
      throw new Error("Unlock encryption before saving data.");
    }
    return enc(text, cryptoKey);
  }, [cryptoKey]);

  const decryptField = useCallback(async (text: string): Promise<string> => {
    if (!cryptoKey) return text;
    return dec(text, cryptoKey);
  }, [cryptoKey]);

  const value = useMemo(
    () => ({
      cryptoKey,
      keyLoading,
      keyRemembered,
      needsUnlock,
      triggerUnlock,
      setRawKey,
      setKeyRemembered,
      lockKey,
      clearKey,
      adoptMigratedKey,
      encryptField,
      decryptField,
    }),
    [
      cryptoKey,
      keyLoading,
      keyRemembered,
      needsUnlock,
      triggerUnlock,
      setRawKey,
      setKeyRemembered,
      lockKey,
      clearKey,
      adoptMigratedKey,
      encryptField,
      decryptField,
    ],
  );

  return (
    <EncryptionContext.Provider value={value}>
      {children}
    </EncryptionContext.Provider>
  );
}
