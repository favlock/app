import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
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

  useEffect(() => {
    // Migrate from localStorage
    if (localStorage.getItem(STORAGE_KEY)) {
      localStorage.removeItem(STORAGE_KEY);
    }

    // Migrate from sessionStorage → IDB
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      sessionStorage.removeItem(STORAGE_KEY);
      importRawKey(raw)
        .then(async (key) => {
          await saveKeyToIDB(key);
          setCryptoKey(key);
          setKeyRememberedState(true);
        })
        .catch(console.error)
        .finally(() => setKeyLoading(false));
      return;
    }

    // Load from IDB
    loadKeyFromIDB()
      .then((key) => {
        setCryptoKey(key);
        setKeyRememberedState(!!key);
      })
      .catch(console.error)
      .finally(() => setKeyLoading(false));
  }, []);

  const triggerUnlock = useCallback(() => setNeedsUnlock(true), []);

  const setRawKey = useCallback(async (
      raw: string,
      options?: { rememberDevice?: boolean },
    ) => {
    const clean = normalizeRawKey(raw);
    const key = await importRawKey(clean);

    const {
      data: { session },
    } = await favLockAuth.getSession();
    if (session) {
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

    if (options?.rememberDevice) {
      await saveKeyToIDB(key);
    } else {
      await deleteKeyFromIDB();
    }
    setCryptoKey(key);
    setKeyRememberedState(!!options?.rememberDevice);
    setNeedsUnlock(false);
    }, []);

  const setKeyRemembered = useCallback(async (rememberDevice: boolean) => {
    if (rememberDevice) {
      if (!cryptoKey) {
        throw new Error("Unlock encryption before remembering this device.");
      }
      await saveKeyToIDB(cryptoKey);
    } else {
      await deleteKeyFromIDB();
    }
    setKeyRememberedState(rememberDevice);
  }, [cryptoKey]);

  const clearKey = useCallback(async () => {
    setCryptoKey(null);
    setKeyRememberedState(false);
    setNeedsUnlock(false);
    await deleteKeyFromIDB();
  }, []);

  const adoptMigratedKey = useCallback(
    async (
      key: CryptoKey,
      options?: { rememberDevice?: boolean },
    ): Promise<boolean> => {
      const rememberDevice = options?.rememberDevice ?? true;
      setCryptoKey(key);
      setNeedsUnlock(false);

      try {
        if (rememberDevice) {
          await saveKeyToIDB(key);
        } else {
          await deleteKeyFromIDB();
        }
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
