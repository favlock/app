import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  BookmarkPlus,
  Check,
  ExternalLink,
  Import,
  Puzzle,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { getBookmarkExportGuideForUserAgent } from "@favlock/shared";
import { CHROME_EXTENSION_URL } from "../lib/appUrls";
import {
  checkChromeExtensionOnboardingStatus,
  supportsFavLockChromeExtension,
  type ChromeExtensionOnboardingStatus,
} from "../lib/chromeExtension";
import {
  ONBOARDING_STATE_CHANGED_EVENT,
  hasCompletedFirstValue,
  markFirstRetrieval,
  readOnboardingState,
  saveOnboardingPreference,
  type OnboardingStateV1,
} from "../lib/onboarding";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";

interface OnboardingDialogProps {
  open: boolean;
  userId: string;
  bookmarkWritesAllowed: boolean;
  onClose: () => void;
  onProtectLibrary: () => void;
  onImportBookmarks: () => void;
  onSaveFirstLink: () => void;
  onFindSavedItem: () => void;
}

function ChecklistItem({
  number,
  complete,
  active,
  title,
  description,
  children,
}: {
  number: number;
  complete: boolean;
  active: boolean;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <li
      aria-current={active ? "step" : undefined}
      className={`flex gap-3 px-4 py-3 sm:px-5 ${
        active
          ? "bg-[color-mix(in_oklab,var(--app-primary)_5%,white)]"
          : "bg-[color-mix(in_oklab,var(--app-card)_72%,white)]"
      }`}
    >
      <span
        className={`mt-0.5 flex size-8 flex-none items-center justify-center rounded-full text-sm font-bold ${
          complete
            ? "bg-emerald-500 text-white"
            : active
              ? "bg-[var(--app-primary)] text-white"
              : "bg-[color-mix(in_oklab,var(--app-line)_9%,white)] text-[var(--app-muted)]"
        }`}
      >
        {complete ? (
          <Check className="size-4" aria-hidden={true} />
        ) : (
          number
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-sm font-bold text-[var(--app-ink)]">{title}</p>
          <span className="text-xs font-semibold text-[var(--app-muted)]">
            {complete ? "Done" : active ? "Next" : "Later"}
          </span>
        </div>
        <p className="mt-0.5 text-sm leading-5 text-[var(--app-muted)]">
          {description}
        </p>
        {children ? <div className="mt-2.5">{children}</div> : null}
      </div>
    </li>
  );
}

function extensionStatusCopy(status: ChromeExtensionOnboardingStatus) {
  switch (status) {
    case "checking":
      return "Checking whether the FavLock extension is available…";
    case "not-installed":
      return "The extension is not detected. Installing it is optional; dashboard saves remain fully supported.";
    case "installed-unpaired":
      return "The extension is installed but not paired. Open it and choose Connect FavLock to grant account access.";
    case "installed-wrong-account":
      return "The extension is paired to a different account. Disconnect it explicitly before pairing this account.";
    case "installed-locked":
      return "The extension is paired to this account, but its local library is locked. Unlock it separately in the extension.";
    case "paired":
      return "The extension is installed, paired to this account, and its local library is unlocked.";
  }
}

export default function OnboardingDialog({
  open,
  userId,
  bookmarkWritesAllowed,
  onClose,
  onProtectLibrary,
  onImportBookmarks,
  onSaveFirstLink,
  onFindSavedItem,
}: OnboardingDialogProps) {
  const [state, setState] = useState<OnboardingStateV1>(() =>
    readOnboardingState(userId),
  );
  const [extensionStatus, setExtensionStatus] =
    useState<ChromeExtensionOnboardingStatus>("checking");
  const extensionStatusRequestRef = useRef(0);
  const extensionSupported = useMemo(
    () =>
      typeof navigator !== "undefined" &&
      supportsFavLockChromeExtension(navigator.userAgent, navigator.vendor),
    [],
  );
  const exportGuide = useMemo(
    () =>
      typeof navigator === "undefined"
        ? null
        : getBookmarkExportGuideForUserAgent(navigator.userAgent),
    [],
  );
  const isMobileBrowser =
    typeof navigator !== "undefined" &&
    /(?:Android|Mobile|iPhone|iPad|iPod)\b/i.test(navigator.userAgent);

  useEffect(() => {
    if (!open) return;
    setState(readOnboardingState(userId));
  }, [open, userId]);

  useEffect(() => {
    const handleStateChange = (event: Event) => {
      if (event instanceof CustomEvent && event.detail?.userId === userId) {
        setState(readOnboardingState(userId));
      }
    };
    window.addEventListener(ONBOARDING_STATE_CHANGED_EVENT, handleStateChange);
    return () =>
      window.removeEventListener(
        ONBOARDING_STATE_CHANGED_EVENT,
        handleStateChange,
      );
  }, [userId]);

  const refreshExtensionStatus = useCallback(async () => {
    if (!extensionSupported || !open) return;
    const requestId = extensionStatusRequestRef.current + 1;
    extensionStatusRequestRef.current = requestId;
    setExtensionStatus("checking");
    const status = await checkChromeExtensionOnboardingStatus({
      extensionId: import.meta.env.VITE_CHROME_EXTENSION_ID,
      userId,
    });
    if (extensionStatusRequestRef.current === requestId) {
      setExtensionStatus(status);
    }
  }, [extensionSupported, open, userId]);

  useEffect(() => {
    if (open) {
      void refreshExtensionStatus();
    } else {
      extensionStatusRequestRef.current += 1;
    }
  }, [open, refreshExtensionStatus]);

  const protectionComplete = state.protection.status === "confirmed";
  const libraryComplete = state.libraryPopulated === "populated";
  const retrievalComplete = state.firstRetrieval === "completed";
  const completedCount = [
    protectionComplete,
    libraryComplete,
    retrievalComplete,
  ].filter(Boolean).length;
  const firstValueComplete = hasCompletedFirstValue(state);
  const protectionPending = state.protection.status === "pending";
  const activeStep = !protectionComplete
    ? 1
    : !libraryComplete
      ? 2
      : !retrievalComplete
        ? 3
        : null;

  const dismiss = () => {
    if (protectionPending) return;
    saveOnboardingPreference(userId, true);
    onClose();
  };

  const continueWith = (action: () => void) => {
    saveOnboardingPreference(userId, false);
    action();
  };

  const exportInstructions = (() => {
    if (isMobileBrowser && exportGuide && exportGuide.id !== "safari") {
      return "This mobile browser does not provide FavLock with bookmark access or a desktop export flow. Export an HTML file from a supported desktop browser, transfer it here, then select that file.";
    }
    if (exportGuide) return exportGuide.instructions;
    return "Use your browser's bookmark manager to export an HTML file. Safari exports bookmarks in a ZIP file.";
  })();

  return (
    <Dialog open={open} onClose={dismiss} size="lg">
      <div className="relative">
        {!protectionPending ? (
          <button
            type="button"
            onClick={dismiss}
            className="theme-button-icon absolute -right-3 -top-3 inline-flex size-9"
            aria-label="Dismiss getting started checklist"
          >
            <X className="size-5" aria-hidden={true} />
          </button>
        ) : null}

        <div className="pr-10">
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.15em] text-[var(--app-primary)]">
            Getting started · {completedCount} of 3 complete
          </p>
          <DialogTitle className="text-xl/7! sm:text-xl/7!">
            {firstValueComplete
              ? "Your library is ready"
              : "Set up your FavLock library"}
          </DialogTitle>
          <DialogDescription className="max-w-lg">
            {firstValueComplete
              ? "You completed every step."
              : protectionPending
                ? "Start by choosing a durable way to unlock your library."
                : "Complete these three steps at your own pace."}
          </DialogDescription>
        </div>

        <DialogBody className="mt-5!">
          <ol className="overflow-hidden rounded-2xl border border-[color-mix(in_oklab,var(--app-line)_12%,transparent)] divide-y divide-[color-mix(in_oklab,var(--app-line)_10%,transparent)]">
            <ChecklistItem
              number={1}
              complete={protectionComplete}
              active={activeStep === 1}
              title="Protect your library"
              description={
                protectionComplete
                  ? state.protection.method === "passkey"
                    ? "Protected with a passkey."
                    : state.protection.method === "recovery-key"
                      ? "Recovery key confirmed."
                      : "Library protection is confirmed."
                  : protectionPending
                    ? "Choose how you’ll unlock your encrypted library."
                    : "Protection progress is not available for this existing library."
              }
            >
              {protectionPending ? (
                <Button
                  type="button"
                  color="emerald"
                  onClick={() => continueWith(onProtectLibrary)}
                >
                  Set up
                </Button>
              ) : null}
            </ChecklistItem>
            <ChecklistItem
              number={2}
              complete={libraryComplete}
              active={activeStep === 2}
              title="Add your first item"
              description={
                libraryComplete
                  ? "You added a real bookmark or article."
                  : "Import existing bookmarks or save one link."
              }
            >
              {!libraryComplete && activeStep === 2 ? (
                <>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      type="button"
                      color="emerald"
                      disabled={!bookmarkWritesAllowed}
                      onClick={() => continueWith(onImportBookmarks)}
                    >
                      <Import data-slot="icon" aria-hidden="true" />
                      Import bookmarks
                    </Button>
                    <Button
                      type="button"
                      outline
                      disabled={!bookmarkWritesAllowed}
                      onClick={() => continueWith(onSaveFirstLink)}
                    >
                      <BookmarkPlus data-slot="icon" aria-hidden="true" />
                      Save one link
                    </Button>
                  </div>

                  {!bookmarkWritesAllowed ? (
                    <p className="mt-3 rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-800" role="status">
                      Your current allowance does not permit another bookmark. Free supported space or upgrade, then try again.
                    </p>
                  ) : null}

                  <details className="mt-3 text-sm text-[var(--app-muted)]">
                    <summary className="cursor-pointer font-semibold text-[var(--app-ink)]">
                      Import help
                    </summary>
                    <div className="mt-2 space-y-2 leading-5">
                      <p>{exportInstructions}</p>
                      <p>
                        FavLock cannot read browser bookmarks by itself. Select the exported HTML or Safari ZIP file in the importer.
                      </p>
                    </div>
                  </details>

                  {extensionSupported ? (
                    <details className="mt-3 text-sm text-[var(--app-muted)]">
                      <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-[var(--app-ink)] [&::-webkit-details-marker]:hidden">
                        <Puzzle className="size-4 text-[var(--app-primary)]" aria-hidden={true} />
                        Save from Chrome (optional)
                      </summary>
                      <div className="mt-2 space-y-2 leading-5">
                        <p>{extensionStatusCopy(extensionStatus)}</p>
                        <p>
                          Install the extension, pair this account, then unlock its library. These are separate steps.
                        </p>
                        <div className="flex flex-wrap gap-2 pt-1">
                          {extensionStatus === "not-installed" ? (
                            <Button href={CHROME_EXTENSION_URL} target="_blank" outline>
                              Install extension
                              <ExternalLink data-slot="icon" aria-hidden="true" />
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            plain
                            disabled={extensionStatus === "checking"}
                            onClick={() => void refreshExtensionStatus()}
                          >
                            <RefreshCw data-slot="icon" aria-hidden="true" />
                            Check again
                          </Button>
                        </div>
                        <p className="text-xs">
                          Opening the store does not prove installation or account access.
                        </p>
                      </div>
                    </details>
                  ) : null}
                </>
              ) : null}
            </ChecklistItem>
            <ChecklistItem
              number={3}
              complete={retrievalComplete}
              active={activeStep === 3}
              title="Find it again"
              description={
                retrievalComplete
                  ? "You found and reopened a saved item."
                  : libraryComplete
                    ? "Make sure something you saved is easy to return to."
                    : "Available after you add your first item."
              }
            >
              {libraryComplete && !retrievalComplete ? (
                <Button
                  type="button"
                  color="emerald"
                  onClick={() =>
                    continueWith(() => {
                      markFirstRetrieval(userId);
                      onFindSavedItem();
                    })
                  }
                >
                  <Search data-slot="icon" aria-hidden="true" />
                  Browse my library
                </Button>
              ) : null}
            </ChecklistItem>
          </ol>
        </DialogBody>

        {protectionPending ? (
          <p className="mt-5 border-t border-[color-mix(in_oklab,var(--app-line)_10%,transparent)] pt-4 text-xs leading-5 text-[var(--app-muted)]">
            Choose a durable unlock method before adding protected content.
          </p>
        ) : (
          <div className="mt-5 flex flex-col-reverse gap-2 border-t border-[color-mix(in_oklab,var(--app-line)_10%,transparent)] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-5 text-[var(--app-muted)]">
              Progress is saved automatically.
            </p>
            {firstValueComplete ? (
              <Button
                type="button"
                color="emerald"
                onClick={dismiss}
                className="self-end sm:self-auto"
              >
                Continue to FavLock
              </Button>
            ) : (
              <Button
                type="button"
                plain
                onClick={dismiss}
                className="self-end sm:self-auto"
              >
                Do this later
              </Button>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}
