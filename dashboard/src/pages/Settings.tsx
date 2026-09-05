import {
  useEffect,
  useState,
  type KeyboardEvent,
  type SubmitEvent,
} from "react";
import { useAuth } from "../context/useAuth";
import { useUserInfo, useUpdateUserInfo } from "../hooks/useUserInfoQuery";
import { Button } from "../components/ui/button";
import {
  Description,
  Field,
  FieldGroup,
  Label,
} from "../components/ui/fieldset";
import { Input } from "../components/ui/input";
import { Text } from "../components/ui/text";
import {
  Check,
  Cloud,
  Gauge,
  Menu,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import {
  useLocation,
  useNavigate,
  useOutletContext,
} from "react-router-dom";
import type { DashboardLayoutContext } from "./DashboardLayout";
import KeyTransferSection from "../components/KeyTransferSection";
import PasswordSignInSection from "../components/PasswordSignInSection";
import PasskeySettingsSection from "../components/PasskeySettingsSection";
import ResourceUsageSection from "../components/ResourceUsageSection";
import LocalPrivacySection from "../components/LocalPrivacySection";
import SearchHistoryPrivacySection from "../components/SearchHistoryPrivacySection";
import BookmarkDuplicateCleanupSection from "../components/BookmarkDuplicateCleanupSection";
import BillingSection from "../components/BillingSection";
import AppearancePreference from "../components/AppearancePreference";
import BookmarkSearchShortcutPreference from "../components/BookmarkSearchShortcutPreference";
import { hasPasswordSignIn } from "../lib/auth";

type SettingsTab = "profile" | "preferences" | "security" | "usage";

const SETTINGS_TABS: SettingsTab[] = [
  "profile",
  "preferences",
  "security",
  "usage",
];

export default function Settings() {
  const { user, isLocalAccount } = useAuth();
  const { setIsMobileSidebarOpen } = useOutletContext<DashboardLayoutContext>();
  const location = useLocation();
  const navigate = useNavigate();
  const shouldOpenEncryptionKey = location.hash === "#settings";
  const activeTab: SettingsTab =
    shouldOpenEncryptionKey || location.hash === "#passkey"
      ? "security"
      : location.hash === "#preferences"
      ? "preferences"
      : location.hash === "#security"
        ? "security"
        : location.hash === "#usage"
          ? "usage"
          : "profile";
  const { data: userInfo, isLoading: loading } = useUserInfo();
  const updateUserInfo = useUpdateUserInfo();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (userInfo) {
      setFirstName(userInfo.first_name ?? "");
      setLastName(userInfo.last_name ?? "");
    }
  }, [userInfo]);

  const handleSave = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    updateUserInfo.mutate(
      { first_name: firstName, last_name: lastName },
      {
        onSuccess: () => {
          setSuccess("Changes saved successfully!");
          setTimeout(() => setSuccess(null), 3000);
        },
        onError: () => {
          setError("Could not save changes. Please try again.");
        },
      },
    );
  };

  const selectTab = (tab: SettingsTab) => {
    navigate({
      pathname: location.pathname,
      search: location.search,
      hash: tab === "profile" ? "" : tab,
    });
  };

  const selectTabFromKeyboard = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentTab: SettingsTab,
  ) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      return;
    }

    event.preventDefault();
    const currentIndex = SETTINGS_TABS.indexOf(currentTab);
    const nextTab =
      event.key === "Home"
        ? SETTINGS_TABS[0]
        : event.key === "End"
          ? SETTINGS_TABS[SETTINGS_TABS.length - 1]
          : event.key === "ArrowRight"
            ? SETTINGS_TABS[(currentIndex + 1) % SETTINGS_TABS.length]
            : SETTINGS_TABS[
                (currentIndex - 1 + SETTINGS_TABS.length) %
                  SETTINGS_TABS.length
              ];
    selectTab(nextTab);
    document.getElementById(`${nextTab}-tab`)?.focus();
  };

  return (
    <div className="w-full min-w-0 flex-1 space-y-6 lg:space-y-8">
      <header className="flex flex-col justify-between gap-4 px-4 pt-4 sm:px-5 md:flex-row md:items-center lg:px-1 lg:pt-1">
        <div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsMobileSidebarOpen(true)}
              className="theme-button-icon -ml-2 inline-flex size-11 lg:hidden"
              aria-label="Open navigation"
            >
              <Menu size={20} aria-hidden="true" />
            </button>
            <h1 className="text-2xl font-semibold tracking-[-0.025em] text-[var(--app-ink)] sm:text-[2rem] sm:leading-tight">
              Settings
            </h1>
          </div>
          <p className="mt-1 text-sm text-[var(--app-muted)] sm:text-[0.95rem]">
            Manage your library preferences, security, and usage
          </p>
        </div>
      </header>

      <section className="px-6 lg:px-0 pb-8">
        <div className="max-w-2xl">
          <div
            role="tablist"
            aria-label="Settings sections"
            className="flex w-fit max-w-full flex-wrap gap-1 rounded-2xl border bg-[var(--app-highlight)]/50 p-1 backdrop-blur-md liquid-divider"
          >
            <button
              id="profile-tab"
              type="button"
              role="tab"
              aria-selected={activeTab === "profile"}
              aria-controls="profile-panel"
              tabIndex={activeTab === "profile" ? 0 : -1}
              onClick={() => selectTab("profile")}
              onKeyDown={(event) =>
                selectTabFromKeyboard(event, "profile")
              }
              className={`flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 ${
                activeTab === "profile"
                  ? "theme-nav-button-active shadow-sm"
                  : "theme-nav-button"
              }`}
            >
              <UserRound size={14} aria-hidden="true" />
              Profile
            </button>
            <button
              id="preferences-tab"
              type="button"
              role="tab"
              aria-selected={activeTab === "preferences"}
              aria-controls="preferences-panel"
              tabIndex={activeTab === "preferences" ? 0 : -1}
              onClick={() => selectTab("preferences")}
              onKeyDown={(event) =>
                selectTabFromKeyboard(event, "preferences")
              }
              className={`flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 ${
                activeTab === "preferences"
                  ? "theme-nav-button-active shadow-sm"
                  : "theme-nav-button"
              }`}
            >
              <SlidersHorizontal size={14} aria-hidden="true" />
              Preferences
            </button>
            <button
              id="security-tab"
              type="button"
              role="tab"
              aria-selected={activeTab === "security"}
              aria-controls="security-panel"
              tabIndex={activeTab === "security" ? 0 : -1}
              onClick={() => selectTab("security")}
              onKeyDown={(event) =>
                selectTabFromKeyboard(event, "security")
              }
              className={`flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 ${
                activeTab === "security"
                  ? "theme-nav-button-active shadow-sm"
                  : "theme-nav-button"
              }`}
            >
              <ShieldCheck size={14} aria-hidden="true" />
              Security &amp; privacy
            </button>
            <button
              id="usage-tab"
              type="button"
              role="tab"
              aria-selected={activeTab === "usage"}
              aria-controls="usage-panel"
              tabIndex={activeTab === "usage" ? 0 : -1}
              onClick={() => selectTab("usage")}
              onKeyDown={(event) => selectTabFromKeyboard(event, "usage")}
              className={`flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 ${
                activeTab === "usage"
                  ? "theme-nav-button-active shadow-sm"
                  : "theme-nav-button"
              }`}
            >
              <Gauge size={14} aria-hidden="true" />
              Plan &amp; usage
            </button>
          </div>

          <div className="mt-4 retro-panel rounded-2xl p-6">
            {activeTab === "profile" ? (
              <div
                id="profile-panel"
                role="tabpanel"
                aria-labelledby="profile-tab"
              >
                {isLocalAccount ? (
                  <CloudOnlySettingsSection
                    title="Profile"
                    description="Profile details belong to a synced FavLock account. Connect a free account to add your name and email."
                  />
                ) : loading ? (
                  <div className="space-y-4">
                    <div className="h-10 liquid-skeleton rounded-[1.05rem]" />
                    <div className="h-10 liquid-skeleton rounded-[1.05rem]" />
                  </div>
                ) : (
                  <form onSubmit={handleSave} className="space-y-6">
                      <div>
                        <h3 className="text-sm font-semibold liquid-ink ">
                          Profile
                        </h3>
                        <p className="mt-1 text-sm liquid-muted ">
                          Update the details shown across your account.
                        </p>
                      </div>

                      {error && (
                        <div
                          className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3"
                          role="alert"
                        >
                          <Text className="text-red-600! dark:text-red-300!  text-sm">
                            {error}
                          </Text>
                        </div>
                      )}

                      {success && (
                        <div
                          className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-4 py-3 flex items-center gap-2"
                          role="status"
                          aria-live="polite"
                        >
                          <Check
                            className="w-4 h-4 text-emerald-600 dark:text-emerald-300 "
                            aria-hidden="true"
                          />
                          <Text className="text-emerald-600! dark:text-emerald-300!  text-sm">
                            {success}
                          </Text>
                        </div>
                      )}

                      <FieldGroup>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <Field>
                            <Label>First name</Label>
                            <Input
                              type="text"
                              value={firstName}
                              onChange={(e) => setFirstName(e.target.value)}
                              placeholder="Your first name"
                              maxLength={256}
                            />
                          </Field>

                          <Field>
                            <Label>Last name</Label>
                            <Input
                              type="text"
                              value={lastName}
                              onChange={(e) => setLastName(e.target.value)}
                              placeholder="Your last name"
                              maxLength={256}
                            />
                          </Field>
                        </div>

                        <Field>
                          <Label>Email</Label>
                          <Input
                            type="email"
                            value={user?.email ?? ""}
                            disabled
                            className="opacity-60 cursor-not-allowed"
                          />
                          <Description className="text-sm text-gray-500 dark:text-[var(--app-muted)] mt-1">
                            Email cannot be changed
                          </Description>
                        </Field>
                      </FieldGroup>

                      <div className="flex items-center gap-4">
                        <Button
                          type="submit"
                          disabled={updateUserInfo.isPending}
                          className="cursor-pointer"
                          color="emerald"
                        >
                          {updateUserInfo.isPending
                            ? "Saving..."
                            : "Save changes"}
                        </Button>

                        <Button href="/" plain className="cursor-pointer">
                          Cancel
                        </Button>
                      </div>
                    </form>
                )}
              </div>
            ) : activeTab === "preferences" ? (
              <div
                id="preferences-panel"
                role="tabpanel"
                aria-labelledby="preferences-tab"
              >
                <AppearancePreference />
                <BookmarkSearchShortcutPreference />
              </div>
            ) : activeTab === "security" ? (
              <div
                id="security-panel"
                role="tabpanel"
                aria-labelledby="security-tab"
                className="space-y-4"
              >
                <KeyTransferSection />
                <PasskeySettingsSection />
                {isLocalAccount ? (
                  <CloudOnlySettingsSection
                    title="Password sign-in"
                    description="Password sign-in is available for synced FavLock accounts. Your local vault continues to unlock with its passkey or recovery key."
                  />
                ) : user ? (
                  <PasswordSignInSection
                    email={user.email ?? ""}
                    hasPassword={hasPasswordSignIn(user)}
                  />
                ) : null}
                {isLocalAccount ? (
                  <CloudOnlySettingsSection
                    title="Cloud search history"
                    description="Encrypted search-history sync is available with a FavLock account. Local vault searches are not sent to FavLock."
                  />
                ) : (
                  <SearchHistoryPrivacySection />
                )}
                <LocalPrivacySection />
              </div>
            ) : (
              <div
                id="usage-panel"
                role="tabpanel"
                aria-labelledby="usage-tab"
                className="space-y-6"
              >
                {isLocalAccount ? (
                  <CloudOnlySettingsSection
                    title="Plan and billing"
                    description="Subscriptions and billing belong to a synced FavLock account. Your local vault limits are shown below."
                  />
                ) : (
                  <BillingSection />
                )}
                <div className="h-px bg-[color-mix(in_oklab,var(--app-line)_14%,transparent)]" />
                <ResourceUsageSection localOnly={isLocalAccount} />
                <BookmarkDuplicateCleanupSection />
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function CloudOnlySettingsSection({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section
      aria-disabled="true"
      className="rounded-2xl border border-gray-200/80 dark:border-[var(--app-line)]/20 bg-gray-50/80 dark:bg-[var(--app-card)]/80 p-4 opacity-75 shadow-sm sm:p-5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Cloud className="size-4 text-gray-500 dark:text-[var(--app-muted)]" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-gray-700 dark:text-[var(--app-ink)]">{title}</h3>
        <span className="rounded-full bg-sky-500/10 px-2.5 py-1 text-xs font-semibold text-sky-700 dark:text-sky-300">
          Cloud only
        </span>
      </div>
      <p className="mt-2 max-w-xl text-sm leading-6 text-gray-600 dark:text-[var(--app-muted)]">
        {description}
      </p>
    </section>
  );
}
