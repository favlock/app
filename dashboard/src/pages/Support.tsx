import { useState, type KeyboardEvent, type SubmitEvent } from "react";
import { ExternalLink, Mail, Menu, ScrollText } from "lucide-react";
import { useOutletContext } from "react-router-dom";
import { Button } from "../components/ui/button";
import { useAuth } from "../context/useAuth";
import { changelog } from "../data/changelog";
import { WEB_DOCS_URL } from "../lib/appUrls";
import {
  submitSupportRequest,
  type SupportRequestKind,
} from "../lib/supportRequests";
import type { DashboardLayoutContext } from "./DashboardLayout";

const tabs = [
  { id: "contact", label: "Contact Us", icon: Mail },
  { id: "changelog", label: "Changelog", icon: ScrollText },
] as const;

type TabId = (typeof tabs)[number]["id"];

const requestTypes: {
  value: SupportRequestKind;
  label: string;
}[] = [
  { value: "contact", label: "Message" },
  { value: "bug", label: "Report a bug" },
  { value: "feature", label: "Request a feature" },
];

const successMessages: Record<SupportRequestKind, string> = {
  contact: "Message sent. We will get back to you soon!",
  bug: "Bug report sent. Thank you!",
  feature: "Feature request sent. Thank you!",
};

export default function Support() {
  const { setIsMobileSidebarOpen } = useOutletContext<DashboardLayoutContext>();
  const { session, user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>("contact");

  const selectTabFromKeyboard = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentTab: TabId,
  ) => {
    const currentIndex = tabs.findIndex(({ id }) => id === currentTab);
    let nextIndex: number | null = null;

    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
    if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    }
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    const nextTab = tabs[nextIndex].id;
    setActiveTab(nextTab);
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
              Support
            </h1>
          </div>
          <p className="mt-1 text-sm text-[var(--app-muted)] sm:text-[0.95rem]">
            Help, updates, and contact
          </p>
        </div>
      </header>

      <section className="px-6 pb-8 lg:px-0">
        <div
          role="tablist"
          aria-label="Support sections"
          className="mb-6 flex w-fit gap-1 rounded-2xl border bg-white/50 p-1 backdrop-blur-md liquid-divider"
        >
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              id={`${id}-tab`}
              type="button"
              role="tab"
              aria-selected={activeTab === id}
              aria-controls={`${id}-panel`}
              tabIndex={activeTab === id ? 0 : -1}
              onClick={() => setActiveTab(id)}
              onKeyDown={(event) => selectTabFromKeyboard(event, id)}
              className={`flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 ${
                activeTab === id
                  ? "theme-nav-button-active shadow-sm"
                  : "theme-nav-button"
              }`}
            >
              <Icon size={14} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>

        <div
          id={`${activeTab}-panel`}
          role="tabpanel"
          aria-labelledby={`${activeTab}-tab`}
          tabIndex={0}
        >
          {activeTab === "changelog" ? (
            <ChangelogTab />
          ) : (
            <ContactForm
              accountEmail={user?.email ?? ""}
              accessToken={session?.access_token ?? ""}
            />
          )}
        </div>
      </section>
    </div>
  );
}

function ChangelogTab() {
  return (
    <div className="max-w-2xl space-y-4">
      {changelog.map((entry) => (
        <div key={entry.version} className="retro-panel rounded-2xl p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="rounded-xl px-2.5 py-1 text-sm font-semibold liquid-chip">
              v{entry.version}
            </span>
            <span className="text-sm liquid-muted">{entry.date}</span>
          </div>
          <ul className="space-y-2">
            {entry.changes.map((change) => (
              <li
                key={change}
                className="flex items-start gap-2.5 text-sm liquid-muted"
              >
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-cyan-500" />
                {change}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function ContactForm({
  accountEmail,
  accessToken,
}: {
  accountEmail: string;
  accessToken: string;
}) {
  const [kind, setKind] = useState<SupportRequestKind>("contact");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<
    { type: "success" | "error"; message: string } | undefined
  >();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus(undefined);
    setIsSubmitting(true);

    try {
      await submitSupportRequest(
        {
          kind,
          subject,
          message,
          website,
        },
        accessToken,
      );
      setSubject("");
      setMessage("");
      setWebsite("");
      setStatus({ type: "success", message: successMessages[kind] });
    } catch (error) {
      setStatus({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "We could not send your message. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-4">
      <div className="retro-panel rounded-2xl p-6">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-cyan-100">
            <Mail size={16} className="text-cyan-700" aria-hidden="true" />
          </div>
          <h2 className="text-sm font-semibold liquid-ink">Contact us</h2>
        </div>
        <p className="mb-6 text-sm liquid-muted">
          Send us a message and we will reply to your email within 48 hours.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {status && (
            <div
              className={`rounded-xl border px-4 py-3 text-sm ${
                status.type === "success"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                  : "border-red-500/30 bg-red-500/10 text-red-600"
              }`}
              role={status.type === "error" ? "alert" : "status"}
              aria-live="polite"
            >
              {status.message}
            </div>
          )}

          <div>
            <label
              htmlFor="support-kind"
              className="mb-1.5 block text-sm font-medium liquid-muted"
            >
              Message type
            </label>
            <select
              id="support-kind"
              value={kind}
              onChange={(event) =>
                setKind(event.target.value as SupportRequestKind)
              }
              disabled={isSubmitting}
              className="w-full rounded-xl border liquid-input px-3.5 py-2.5 text-sm transition focus:outline-none focus:ring-2 focus:ring-cyan-500/40 disabled:opacity-60"
            >
              {requestTypes.map((requestType) => (
                <option key={requestType.value} value={requestType.value}>
                  {requestType.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="support-email"
              className="mb-1.5 block text-sm font-medium liquid-muted"
            >
              Your email
            </label>
            <input
              id="support-email"
              type="email"
              autoComplete="email"
              value={accountEmail}
              disabled
              aria-describedby="support-email-description"
              className="w-full rounded-xl border liquid-input px-3.5 py-2.5 text-sm opacity-60"
            />
            <p
              id="support-email-description"
              className="mt-1.5 text-xs liquid-muted"
            >
              Replies will be sent to your FavLock account email.
            </p>
          </div>

          <div>
            <label
              htmlFor="support-subject"
              className="mb-1.5 block text-sm font-medium liquid-muted"
            >
              Subject
            </label>
            <input
              id="support-subject"
              type="text"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="How can we help?"
              maxLength={160}
              required
              disabled={isSubmitting}
              className="w-full rounded-xl border liquid-input px-3.5 py-2.5 text-sm transition focus:outline-none focus:ring-2 focus:ring-cyan-500/40 disabled:opacity-60"
            />
          </div>

          <div>
            <label
              htmlFor="support-message"
              className="mb-1.5 block text-sm font-medium liquid-muted"
            >
              Message
            </label>
            <textarea
              id="support-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Tell us more..."
              maxLength={10_000}
              rows={5}
              required
              disabled={isSubmitting}
              className="w-full resize-none rounded-xl border liquid-input px-3.5 py-2.5 text-sm transition focus:outline-none focus:ring-2 focus:ring-cyan-500/40 disabled:opacity-60"
            />
          </div>

          <div
            className="absolute -left-[10000px] top-auto size-px overflow-hidden"
            aria-hidden="true"
          >
            <label htmlFor="support-website">Website</label>
            <input
              id="support-website"
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
            />
          </div>

          <Button type="submit" color="emerald" disabled={isSubmitting}>
            <Mail size={14} aria-hidden="true" />
            {isSubmitting ? "Sending..." : "Send message"}
          </Button>
        </form>
      </div>

      <div className="retro-panel rounded-2xl p-5">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-cyan-100">
            <ScrollText
              size={16}
              className="text-cyan-700"
              aria-hidden="true"
            />
          </div>
          <h2 className="text-sm font-semibold liquid-ink">Documentation</h2>
        </div>
        <p className="mb-3 text-sm liquid-muted">
          Check our usage guide for quick answers.
        </p>
        <a
          href={WEB_DOCS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm font-medium text-cyan-700 transition-colors hover:text-cyan-800"
        >
          FavLock documentation
          <ExternalLink size={12} aria-hidden="true" />
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </div>
    </div>
  );
}
