import { useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useLocation, useMatch, useNavigate } from "react-router-dom";
import FolderSidebar from "../components/FolderSidebar";
import CloudConnectionNotice from "../components/CloudConnectionNotice";
import { useFolders } from "../hooks/useFoldersQuery";
import { useTags } from "../hooks/useTagsQuery";
import {
  buildCollectionSlugIndex,
  buildTagSlugIndex,
} from "../lib/collectionSlugs";
import { useBookmarkStore } from "../store/bookmarkStore";
import { X } from "lucide-react";
import AddBookmarkForm from "../components/AddBookmarkForm";
import * as Headless from "@headlessui/react";
import SearchEnginePreferenceDialog from "../components/SearchEnginePreferenceDialog";
import OnboardingDialog from "../components/OnboardingDialog";
import { useUserInfo } from "../hooks/useUserInfoQuery";
import {
  hasCompletedFirstValue,
  isOnboardingHidden,
  hasConfirmedProtection,
  markAccountReady,
  ONBOARDING_STATE_CHANGED_EVENT,
  readOnboardingState,
  reconcileExistingAccountOnboarding,
  setLibraryPopulated,
} from "../lib/onboarding";
import { useAuth } from "../context/useAuth";
import { useEncryption } from "../context/useEncryption";
import { requestEncryptionSetup } from "../lib/encryptionSetupFlow";
import DataTransferDialog, {
  type DataTransferView,
} from "../components/DataTransferDialog";
import { useAccountPlan } from "../hooks/useAccountPlanQuery";
import BookmarkLimitRecovery, { BookmarkLimitGraceNotice } from "../components/BookmarkLimitRecovery";
import { useBookmarkCounts } from "../hooks/useBookmarksQuery";
import { useOnboardingProgressSync } from "../hooks/useOnboardingProgressSync";

export interface DashboardLayoutContext {
  setIsMobileSidebarOpen: (v: boolean) => void;
  openAddBookmark: (currentFolderId?: string | null) => void;
}

export default function DashboardLayout() {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isAddBookmarkOpen, setIsAddBookmarkOpen] = useState(false);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [resumeOnboardingAfterAction, setResumeOnboardingAfterAction] =
    useState(false);
  const [resumeOnboardingAfterProtection, setResumeOnboardingAfterProtection] =
    useState(false);
  const [dataTransferView, setDataTransferView] =
    useState<DataTransferView | null>(null);
  const [hasFinishedInitialOnboarding, setHasFinishedInitialOnboarding] =
    useState(false);
  const [onboardingStateRevision, setOnboardingStateRevision] = useState(0);
  const hasCheckedOnboarding = useRef(false);
  const onboardingUserIdRef = useRef<string | null>(null);
  const [addBookmarkFolderId, setAddBookmarkFolderId] = useState<string | null>(
    null,
  );
  const [addBookmarkSeed, setAddBookmarkSeed] = useState({
    url: "",
    title: "",
  });

  const { setSelectedFolderId, setSelectedTagId } = useBookmarkStore();
  const {
    data: folders = [],
    isLoading: loadingFolders,
  } = useFolders();
  const {
    data: tags = [],
    isLoading: loadingTags,
  } = useTags();
  const { data: userInfo, isSuccess: userInfoLoaded } = useUserInfo();
  const { user } = useAuth();
  const { cryptoKey, needsUnlock } = useEncryption();
  const { data: accountPlan } = useAccountPlan();
  const { data: bookmarkCounts, isSuccess: bookmarkCountsLoaded } =
    useBookmarkCounts();
  const { ready: onboardingProgressReady } = useOnboardingProgressSync();
  const bookmarkAccess = accountPlan?.bookmarkAccess;

  const location = useLocation();
  const navigate = useNavigate();
  const mainContentRef = useRef<HTMLElement>(null);
  const previousPathRef = useRef(location.pathname);
  const collectionMatch = useMatch("/c/:collectionSlug");
  const collectionSlug = collectionMatch?.params.collectionSlug ?? null;
  const tagMatch = useMatch("/t/:tagSlug");
  const tagSlug = tagMatch?.params.tagSlug ?? null;
  const collectionSlugIndex = useMemo(
    () => buildCollectionSlugIndex(folders),
    [folders],
  );
  const tagSlugIndex = useMemo(() => buildTagSlugIndex(tags), [tags]);
  const selectedCollectionId = collectionSlug
    ? (collectionSlugIndex.idBySlug.get(collectionSlug) ?? null)
    : null;
  const selectedTagId = tagSlug
    ? (tagSlugIndex.idBySlug.get(tagSlug) ?? null)
    : null;
  const dataTransferHashView: DataTransferView | null =
    location.hash === "#import-bookmarks"
      ? "import"
      : location.hash === "#export-data"
        ? "export"
        : location.hash === "#migrate-account"
          ? "migrate"
          : null;
  const activeDataTransferView = dataTransferHashView ?? dataTransferView;

  useEffect(() => {
    setIsMobileSidebarOpen(false);

    if (previousPathRef.current !== location.pathname) {
      previousPathRef.current = location.pathname;
      window.requestAnimationFrame(() => {
        mainContentRef.current?.focus({ preventScroll: true });
      });
    }
  }, [location.pathname, location.hash, setIsMobileSidebarOpen]);

  useEffect(() => {
    const userId = user?.id ?? null;
    if (onboardingUserIdRef.current === userId) return;
    onboardingUserIdRef.current = userId;
    hasCheckedOnboarding.current = false;
    setIsOnboardingOpen(false);
    setResumeOnboardingAfterAction(false);
    setResumeOnboardingAfterProtection(false);
    setHasFinishedInitialOnboarding(false);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !userInfoLoaded || !userInfo?.key_verifier) return;
    const onboardingState = readOnboardingState(user.id);
    if (onboardingState.protection.status === "unknown") {
      reconcileExistingAccountOnboarding(user.id);
    }
  }, [user?.id, userInfo?.key_verifier, userInfoLoaded]);

  useEffect(() => {
    if (!user?.id || !bookmarkCountsLoaded) return;
    const onboardingState = readOnboardingState(user.id);
    if (
      hasConfirmedProtection(onboardingState) &&
      onboardingState.libraryPopulated === "unknown"
    ) {
      setLibraryPopulated(
        user.id,
        (bookmarkCounts?.bookmarkCount ?? 0) > 0,
      );
    }
  }, [
    bookmarkCounts?.bookmarkCount,
    bookmarkCountsLoaded,
    user?.id,
  ]);

  useEffect(() => {
    if (user?.id) markAccountReady(user.id);
  }, [user?.id]);

  useEffect(() => {
    const handleStateChange = (event: Event) => {
      if (
        event instanceof CustomEvent &&
        event.detail?.userId === user?.id
      ) {
        setOnboardingStateRevision((revision) => revision + 1);
        if (user?.id) {
          const onboardingState = readOnboardingState(user.id);
          if (
            resumeOnboardingAfterProtection &&
            hasConfirmedProtection(onboardingState)
          ) {
            setResumeOnboardingAfterProtection(false);
            setIsOnboardingOpen(true);
          }
          if (hasCompletedFirstValue(onboardingState)) {
            setHasFinishedInitialOnboarding(true);
          }
        }
      }
    };
    window.addEventListener(ONBOARDING_STATE_CHANGED_EVENT, handleStateChange);
    return () =>
      window.removeEventListener(
        ONBOARDING_STATE_CHANGED_EVENT,
        handleStateChange,
      );
  }, [resumeOnboardingAfterProtection, user?.id]);

  useEffect(() => {
    if (
      hasCheckedOnboarding.current ||
      !onboardingProgressReady ||
      !userInfoLoaded
    ) {
      return;
    }

    if (!user?.id) return;
    const onboardingState = readOnboardingState(user.id);
    if (onboardingState.protection.status === "pending") {
      if (!cryptoKey || needsUnlock) return;
      hasCheckedOnboarding.current = true;
      setIsOnboardingOpen(true);
      return;
    }
    if (!userInfo?.key_verifier) return;

    hasCheckedOnboarding.current = true;
    if (!hasConfirmedProtection(onboardingState)) {
      setHasFinishedInitialOnboarding(true);
      return;
    }
    if (
      hasCompletedFirstValue(onboardingState) ||
      isOnboardingHidden(user.id)
    ) {
      setHasFinishedInitialOnboarding(true);
    } else {
      setIsOnboardingOpen(true);
    }
  }, [
    onboardingStateRevision,
    onboardingProgressReady,
    cryptoKey,
    needsUnlock,
    user?.id,
    userInfo?.key_verifier,
    userInfoLoaded,
  ]);

  useEffect(() => {
    if (
      location.pathname === "/settings" ||
      location.pathname === "/support" ||
      location.pathname === "/trash" ||
      location.pathname === "/lists"
    ) {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
  }, [location.pathname]);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const addUrl = searchParams.get("addUrl");
    if (!addUrl) return;

    if (bookmarkAccess && bookmarkAccess.mode !== "normal") {
      setIsAddBookmarkOpen(false);
      return;
    }

    setAddBookmarkFolderId(null);
    setAddBookmarkSeed({
      url: addUrl,
      title: searchParams.get("addTitle") ?? "",
    });
    setIsAddBookmarkOpen(true);
  }, [bookmarkAccess, location.search]);

  useEffect(() => {
    if (!collectionSlug || loadingFolders) return;
    if (!selectedCollectionId) navigate("/", { replace: true });
  }, [collectionSlug, loadingFolders, selectedCollectionId, navigate]);

  useEffect(() => {
    if (!tagSlug || loadingTags) return;
    if (!selectedTagId) navigate("/", { replace: true });
  }, [tagSlug, loadingTags, selectedTagId, navigate]);

  const effectiveFolderId =
    location.pathname === "/favorites"
      ? "favorites"
      : location.pathname === "/unsorted"
        ? "unsorted"
        : selectedCollectionId;

  const handleSelectFolder = (id: string | null) => {
    if (id === "favorites") {
      navigate("/favorites");
      setSelectedFolderId(null);
      setSelectedTagId(null);
    } else if (id === "unsorted") {
      navigate("/unsorted");
      setSelectedFolderId(null);
      setSelectedTagId(null);
    } else if (id === null) {
      navigate("/");
      setSelectedFolderId(null);
      setSelectedTagId(null);
    } else {
      const collectionSlugForId = collectionSlugIndex.slugById.get(id);
      if (!collectionSlugForId) return;
      navigate(`/c/${collectionSlugForId}`);
      setSelectedFolderId(id);
    }
  };

  const handleSelectTag = (id: string | null) => {
    if (id === null) {
      navigate("/");
      setSelectedTagId(null);
      return;
    }

    const tagSlugForId = tagSlugIndex.slugById.get(id);
    if (!tagSlugForId) return;

    navigate(`/t/${tagSlugForId}`);
    setSelectedTagId(id);
  };

  const clearAddBookmarkQuery = () => {
    const searchParams = new URLSearchParams(location.search);
    searchParams.delete("addUrl");
    searchParams.delete("addTitle");

    const nextSearch = searchParams.toString();
    navigate(
      {
        pathname: location.pathname,
        search: nextSearch ? `?${nextSearch}` : "",
      },
      { replace: true },
    );
  };

  const closeAddBookmark = () => {
    setIsAddBookmarkOpen(false);
    setAddBookmarkSeed({ url: "", title: "" });
    clearAddBookmarkQuery();
    if (resumeOnboardingAfterAction && user?.id) {
      setResumeOnboardingAfterAction(false);
      if (!hasCompletedFirstValue(readOnboardingState(user.id))) {
        setIsOnboardingOpen(true);
      }
    }
  };

  const openAddBookmark = (currentFolderId: string | null = null) => {
    if (bookmarkAccess && bookmarkAccess.mode !== "normal") return;
    setResumeOnboardingAfterAction(false);
    setAddBookmarkFolderId(currentFolderId);
    setAddBookmarkSeed({ url: "", title: "" });
    setIsAddBookmarkOpen(true);
  };

  if (bookmarkAccess?.mode === "recovery") {
    return <BookmarkLimitRecovery access={bookmarkAccess} />;
  }

  const closeDataTransfer = () => {
    setDataTransferView(null);
    if (dataTransferHashView) {
      navigate(
        {
          pathname: location.pathname,
          search: location.search,
          hash: "",
        },
        { replace: true },
      );
    }
    if (resumeOnboardingAfterAction && user?.id) {
      setResumeOnboardingAfterAction(false);
      if (!hasCompletedFirstValue(readOnboardingState(user.id))) {
        setIsOnboardingOpen(true);
      }
    }
  };

  const changeDataTransferView = (view: DataTransferView) => {
    setDataTransferView(view);
    if (dataTransferHashView) {
      navigate(
        {
          pathname: location.pathname,
          search: location.search,
          hash: "",
        },
        { replace: true },
      );
    }
  };

  const openOnboardingImport = () => {
    setIsOnboardingOpen(false);
    setResumeOnboardingAfterAction(true);
    setDataTransferView("import");
  };

  const openOnboardingProtection = () => {
    if (!user?.id) return;
    const onboardingState = readOnboardingState(user.id);
    if (
      onboardingState.protection.status !== "pending" ||
      !cryptoKey ||
      needsUnlock
    ) {
      return;
    }
    setIsOnboardingOpen(false);
    setResumeOnboardingAfterProtection(true);
    requestEncryptionSetup(user.id);
  };

  const openOnboardingManualSave = () => {
    if (bookmarkAccess && bookmarkAccess.mode !== "normal") return;
    setIsOnboardingOpen(false);
    setResumeOnboardingAfterAction(true);
    setAddBookmarkFolderId(null);
    setAddBookmarkSeed({ url: "", title: "" });
    setIsAddBookmarkOpen(true);
  };

  const findSavedOnboardingItem = () => {
    setIsOnboardingOpen(false);
    setResumeOnboardingAfterAction(false);
    navigate("/");
    window.setTimeout(() => {
      document
        .querySelector<HTMLInputElement>('[aria-label="Search your library"]')
        ?.focus();
    }, 0);
  };

  const bookmarkWritesAllowed =
    !bookmarkAccess || bookmarkAccess.mode === "normal";

  return (
    <div className="text-[var(--app-ink)] font-sans antialiased min-h-screen">
      <SearchEnginePreferenceDialog enabled={hasFinishedInitialOnboarding} />
      <OnboardingDialog
        open={isOnboardingOpen}
        userId={user?.id ?? ""}
        bookmarkWritesAllowed={bookmarkWritesAllowed}
        onProtectLibrary={openOnboardingProtection}
        onImportBookmarks={openOnboardingImport}
        onSaveFirstLink={openOnboardingManualSave}
        onFindSavedItem={findSavedOnboardingItem}
        onClose={() => {
          setIsOnboardingOpen(false);
          setHasFinishedInitialOnboarding(true);
        }}
      />
      <DataTransferDialog
        view={activeDataTransferView}
        onViewChange={changeDataTransferView}
        onClose={closeDataTransfer}
      />

      <a
        href="#main-content"
        className="fixed left-4 top-4 z-[60] -translate-y-24 rounded-lg bg-[var(--app-ink)] px-4 py-2 text-sm font-semibold text-white shadow-lg transition-transform focus:translate-y-0 focus:outline-none focus:ring-2 focus:ring-[var(--app-primary)] focus:ring-offset-2"
      >
        Skip to main content
      </a>

      <AddBookmarkForm
        onAdded={closeAddBookmark}
        currentFolderId={addBookmarkFolderId}
        open={isAddBookmarkOpen}
        onClose={closeAddBookmark}
        hideTrigger
        initialUrl={addBookmarkSeed.url}
        initialTitle={addBookmarkSeed.title}
      />

      <div className="mx-auto min-h-screen max-w-[104rem] pb-10 lg:p-4 xl:p-5">
        <div className="lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start lg:gap-5 xl:grid-cols-[18rem_minmax(0,1fr)] xl:gap-6">
          {/* Mobile sidebar drawer */}
          <Headless.Dialog
            open={isMobileSidebarOpen}
            onClose={setIsMobileSidebarOpen}
            className="relative z-50 lg:hidden"
          >
            <Headless.DialogBackdrop
              transition
              className="mobile-navigation-backdrop bg-black/55 transition-opacity duration-300 data-closed:opacity-0"
            />
            <Headless.DialogPanel
              transition
              className="fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom))] left-3 top-[calc(0.75rem+env(safe-area-inset-top))] flex w-80 max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-[1.65rem] border border-[color-mix(in_oklab,var(--app-line)_12%,transparent)] bg-[var(--app-bg)] p-3 shadow-[0_24px_64px_-20px_rgba(29,34,48,0.42)] transition-transform duration-300 data-closed:-translate-x-[calc(100%+1rem)]"
            >
              <Headless.DialogTitle className="sr-only">
                Navigation
              </Headless.DialogTitle>
              <div className="mb-2 flex flex-none items-center justify-end px-1">
                <button
                  type="button"
                  onClick={() => setIsMobileSidebarOpen(false)}
                  className="theme-button-icon inline-flex size-11"
                  aria-label="Close navigation"
                >
                  <X size={20} aria-hidden="true" />
                </button>
              </div>
              <div className="min-h-0 flex-1">
                <FolderSidebar
                  selectedFolderId={effectiveFolderId}
                  onSelectFolder={(id) => {
                    handleSelectFolder(id);
                    setIsMobileSidebarOpen(false);
                  }}
                  selectedTagId={selectedTagId}
                  onSelectTag={(id) => {
                    handleSelectTag(id);
                    setIsMobileSidebarOpen(false);
                  }}
                  onStartOnboarding={() => {
                    setIsMobileSidebarOpen(false);
                    setIsOnboardingOpen(true);
                  }}
                  onOpenDataTransfer={() => {
                    setIsMobileSidebarOpen(false);
                    setDataTransferView("chooser");
                  }}
                />
              </div>
            </Headless.DialogPanel>
          </Headless.Dialog>

          {/* Sidebar - desktop only */}
          <aside className="hidden lg:sticky lg:top-4 lg:block lg:h-[calc(100dvh-2rem)] lg:min-h-0 xl:top-5 xl:h-[calc(100dvh-2.5rem)]">
            <FolderSidebar
              selectedFolderId={effectiveFolderId}
              onSelectFolder={handleSelectFolder}
              selectedTagId={selectedTagId}
              onSelectTag={handleSelectTag}
              onStartOnboarding={() => {
                setIsOnboardingOpen(true);
              }}
              onOpenDataTransfer={() => setDataTransferView("chooser")}
            />
          </aside>

          <main
            ref={mainContentRef}
            id="main-content"
            tabIndex={-1}
            className="w-full min-w-0 pb-[env(safe-area-inset-bottom)] focus:outline-none"
          >
            <CloudConnectionNotice />
            {bookmarkAccess?.mode === "grace" ? (
              <BookmarkLimitGraceNotice access={bookmarkAccess} />
            ) : null}
            <Outlet
              context={
                {
                  setIsMobileSidebarOpen,
                  openAddBookmark,
                } satisfies DashboardLayoutContext
              }
            />
          </main>
        </div>
      </div>
    </div>
  );
}
