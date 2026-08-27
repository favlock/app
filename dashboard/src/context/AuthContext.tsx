import {
  useCallback,
  createContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  favLockAuth,
  type AuthSession,
  type AuthUser,
} from "../lib/favLockAuth";
import { queryClient } from "../lib/queryClient";
import { useBookmarkStore } from "../store/bookmarkStore";
import { useEncryption } from "./useEncryption";
import {
  clearBookmarkCacheForUser,
  clearLibraryContentCacheForUser,
  getBookmarkCacheMeta,
  getLibraryContentCacheMeta,
} from "../lib/bookmarkCache";
import { syncBookmarksToLocalCache } from "../lib/bookmarkSync";
import { syncLibraryContentToLocalCache } from "../lib/libraryContentSync";
import { getProfileNamesFromUser } from "../lib/auth";
import {
  fetchUserInfo,
  USER_INFO_STALE_TIME,
  userInfoQueryKey,
} from "../lib/userInfo";
import { STORAGE_KEY } from "../lib/encryption";
import { clearLocalSearchHistoryForUser } from "../lib/searchHistory";
import { hydrateLibraryQueryCache } from "../lib/hydrateLibraryQueryCache";
import { updateAccountProfile } from "../lib/accountSettingsApi";
import { startLibraryRevalidation } from "../lib/libraryRevalidation";
import { cloudStatusMessage, type CloudStatus } from "../lib/cloudAccess";
import { clearLocalKeyVerifier, readLocalKeyVerifier } from "../lib/localKeyVerifier";
import { cancelLocalVaultWork } from "../lib/localVaultWork";

interface AuthContextType {
  session: AuthSession | null;
  user: AuthUser | null;
  loading: boolean;
  libraryCacheHydrating: boolean;
  bookmarkCacheSyncing: boolean;
  bookmarkCacheSyncedAt: string | null;
  bookmarkCacheError: string | null;
  retryBookmarkCacheSync: () => void;
  signOut: () => Promise<void>;
  cloudStatus: CloudStatus;
  retryCloudConnection: () => Promise<void>;
  connectionError: string | null;
}

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthContextType | undefined>(
  undefined,
);

function activeSession(session: AuthSession | null): AuthSession | null {
  return session && session.expires_at * 1000 > Date.now() ? session : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>("signed_out");
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [libraryCacheHydrating, setLibraryCacheHydrating] = useState(true);
  const [bookmarkCacheSyncing, setBookmarkCacheSyncing] = useState(false);
  const [bookmarkCacheSyncedAt, setBookmarkCacheSyncedAt] = useState<
    string | null
  >(null);
  const [bookmarkCacheError, setBookmarkCacheError] = useState<string | null>(
    null,
  );
  const [bookmarkCacheRetryToken, setBookmarkCacheRetryToken] = useState(0);
  const lastUserIdRef = useRef<string | null>(null);
  const cleanupRef = useRef<Promise<void> | null>(null);
  const { clearKey, cryptoKey, keyLoading, triggerUnlock, decryptField } =
    useEncryption();

  const clearLocalDataForUser = useCallback(
    (userId: string): Promise<void> => {
      if (cleanupRef.current) return cleanupRef.current;
      const drained = cancelLocalVaultWork(userId);
      setLoading(true);
      queryClient.clear();
      useBookmarkStore.getState().reset();
      localStorage.removeItem("themeVariant");
      localStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(STORAGE_KEY);
      clearLocalSearchHistoryForUser(userId);
      clearLocalKeyVerifier(userId);
      setBookmarkCacheSyncedAt(null);
      setLibraryCacheHydrating(false);
      setBookmarkCacheSyncing(false);
      setBookmarkCacheError(null);

      const cleanup = (async () => {
        await drained;
        const results = await Promise.allSettled([
          clearKey(),
          clearBookmarkCacheForUser(userId),
          clearLibraryContentCacheForUser(userId),
        ]);
        if (results.some((result) => result.status === "rejected")) {
          throw new Error(
            "Some local FavLock data could not be cleared. Clear this site's data in your browser settings.",
          );
        }
      })();
      cleanupRef.current = cleanup;
      void cleanup.then(() => {
        cleanupRef.current = null;
        setLoading(false);
      }, () => {
        cleanupRef.current = null;
        setLoading(false);
      });
      return cleanup;
    },
    [clearKey],
  );

  useEffect(() => {
    lastUserIdRef.current = user?.id ?? null;
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;
    const stopCrossTabSynchronization =
      favLockAuth.startCrossTabSynchronization();

    void favLockAuth.getSession().then(({ data: { session }, error }) => {
      if (cancelled) return;
      const status = favLockAuth.getCloudStatus();
      setCloudStatus(status);
      setConnectionError(error?.message ?? null);
      setSession(status === "available" ? activeSession(session) : null);
      setUser(favLockAuth.getLocalUser());
      if (!cleanupRef.current) setLoading(false);
    });

    const {
      data: { subscription },
    } = favLockAuth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      if (_event === "SIGNED_IN" || _event === "SIGNED_OUT" || _event === "TOKEN_REFRESHED") setConnectionError(null);
      const lastUserId = lastUserIdRef.current;
      if (
        lastUserId &&
        _event === "SIGNED_OUT"
      ) {
        void clearLocalDataForUser(lastUserId).catch(console.error);
      }
      const status = favLockAuth.getCloudStatus();
      setCloudStatus(status);
      setSession(status === "available" ? activeSession(session) : null);
      setUser(favLockAuth.getLocalUser());
      if (!cleanupRef.current) setLoading(false);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      stopCrossTabSynchronization();
    };
  }, [clearLocalDataForUser]);

  useEffect(() => {
    if (!user?.id) {
      setBookmarkCacheSyncedAt(null);
      if (!loading) setLibraryCacheHydrating(false);
      return;
    }

    let cancelled = false;
    const hydrateSyncMeta = async () => {
      setLibraryCacheHydrating(true);
      try {
        const [bookmarkMeta, contentMeta] = await Promise.all([
          getBookmarkCacheMeta(user.id),
          getLibraryContentCacheMeta(user.id),
        ]);
        const value =
          bookmarkMeta && contentMeta
            ? bookmarkMeta.lastSyncedAt < contentMeta.lastSyncedAt
              ? bookmarkMeta.lastSyncedAt
              : contentMeta.lastSyncedAt
            : null;
        if (!cancelled && value) {
          await hydrateLibraryQueryCache(queryClient, user.id);
        }
        if (!cancelled) setBookmarkCacheSyncedAt(value);
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to hydrate local library cache:", error);
          setBookmarkCacheError(
            "Could not open the local library cache. Check this browser's storage settings.",
          );
        }
      } finally {
        if (!cancelled) setLibraryCacheHydrating(false);
      }
    };

    void hydrateSyncMeta();
    return () => {
      cancelled = true;
    };
  }, [user?.id, loading]);

  useEffect(() => {
    if (!user?.id || !session?.access_token) return;

    let cancelled = false;

    const ensureUserInfo = async () => {
      let data;
      try {
        data = await queryClient.fetchQuery({
          queryKey: userInfoQueryKey(user.id),
          queryFn: () => fetchUserInfo(session.access_token),
          staleTime: USER_INFO_STALE_TIME,
        });
      } catch (error) {
        console.error("Failed to check user info:", error);
        return;
      }

      if (
        cancelled ||
        (data && (data.first_name?.trim() || data.last_name?.trim()))
      ) {
        return;
      }

      const { firstName, lastName } = getProfileNamesFromUser(user);
      try {
        await updateAccountProfile(session.access_token, {
          firstName,
          lastName,
        });
        await queryClient.invalidateQueries({
          queryKey: userInfoQueryKey(user.id),
        });
      } catch (error) {
        console.error("Failed to save user info:", error);
      }
    };

    void ensureUserInfo();

    return () => {
      cancelled = true;
    };
  }, [session?.access_token, user]);

  useEffect(() => {
    if (!user?.id || keyLoading || cryptoKey) return;
    if (readLocalKeyVerifier(user.id)) {
      triggerUnlock();
      return;
    }
    if (!session?.access_token) return;

    let cancelled = false;
    const checkKeyVerifier = async () => {
      let data;
      try {
        data = await queryClient.fetchQuery({
          queryKey: userInfoQueryKey(user.id),
          queryFn: () => fetchUserInfo(session.access_token),
          staleTime: USER_INFO_STALE_TIME,
        });
      } catch (error) {
        console.error("Failed to check encryption key verifier:", error);
        return;
      }

      if (!cancelled && data?.key_verifier) {
        triggerUnlock();
      }
    };

    void checkKeyVerifier();
    return () => {
      cancelled = true;
    };
  }, [user?.id, session?.access_token, keyLoading, cryptoKey, triggerUnlock]);

  useEffect(() => {
    if (!user?.id || !session?.access_token || keyLoading || !cryptoKey) return;

    let cancelled = false;
    const runSync = async () => {
      try {
        setBookmarkCacheSyncing(true);
        setBookmarkCacheError(null);
        const [bookmarkResult, contentResult] = await Promise.all([
          syncBookmarksToLocalCache(
            user.id,
            session.access_token,
            decryptField,
          ),
          syncLibraryContentToLocalCache(
            user.id,
            session.access_token,
            decryptField,
          ),
        ]);
        if (!cancelled) {
          setBookmarkCacheSyncedAt(
            bookmarkResult.lastSyncedAt < contentResult.lastSyncedAt
              ? bookmarkResult.lastSyncedAt
              : contentResult.lastSyncedAt,
          );
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to sync local bookmark cache:", error);
          setBookmarkCacheError(
            "Could not update the local library cache. Check your connection and try again.",
          );
        }
      } finally {
        if (!cancelled) {
          setBookmarkCacheSyncing(false);
          for (const queryKey of [
            ["bookmarks"],
            ["entries"],
            ["folders"],
            ["tags"],
            ["notes"],
            ["todos"],
            ["readspace"],
            ["trash"],
          ]) {
            void queryClient.invalidateQueries({ queryKey });
          }
        }
      }
    };

    void runSync();
    return () => {
      cancelled = true;
    };
  }, [
    user?.id,
    session?.access_token,
    keyLoading,
    cryptoKey,
    decryptField,
    bookmarkCacheRetryToken,
  ]);

  useEffect(() => {
    if (!user?.id || !cryptoKey || cloudStatus !== "available") return;

    return startLibraryRevalidation(() => {
      setBookmarkCacheRetryToken((token) => token + 1);
    });
  }, [user?.id, cryptoKey, cloudStatus]);

  const signOut = async () => {
    const userId = lastUserIdRef.current;
    const logout = favLockAuth.signOut();
    let cleanupError: unknown = null;

    if (userId) {
      try {
        await clearLocalDataForUser(userId);
      } catch (error) {
        cleanupError = error;
      }
    }

    const { error } = await logout;
    if (error) throw error;
    if (cleanupError) throw cleanupError;
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        loading,
        libraryCacheHydrating,
        bookmarkCacheSyncing,
        bookmarkCacheSyncedAt,
        bookmarkCacheError,
        cloudStatus,
        connectionError,
        retryCloudConnection: async () => {
          await favLockAuth.retryCloudConnection();
          setBookmarkCacheRetryToken((token) => token + 1);
        },
        retryBookmarkCacheSync: () =>
          cloudStatus === "available" ? setBookmarkCacheRetryToken((token) => token + 1) :
            setBookmarkCacheError(cloudStatusMessage(cloudStatus)),
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
