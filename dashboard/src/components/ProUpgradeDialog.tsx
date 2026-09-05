import { formatResourceLimit, PLANS } from "@favlock/shared";
import {
  BookOpen,
  Bookmark,
  Check,
  FileText,
  Headphones,
  History,
  Highlighter,
  ListChecks,
  Search,
  Sparkles,
} from "lucide-react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";

interface ProUpgradeDialogProps {
  open: boolean;
  onClose: () => void;
}

const comparisonRows = [
  {
    label: "Bookmarks",
    free: `Up to ${formatResourceLimit(PLANS.free.limits.bookmarks)}`,
    pro: formatResourceLimit(PLANS.pro.limits.bookmarks),
    icon: Bookmark,
  },
  {
    label: "Search",
    free: "Bookmark details",
    pro: "Full content",
    icon: Search,
  },
  {
    label: "Web highlights",
    free: formatResourceLimit(PLANS.free.limits.highlights),
    pro: `${formatResourceLimit(PLANS.pro.limits.highlights)} · annotations`,
    icon: Highlighter,
  },
  {
    label: "Documents and tasks",
    free: PLANS.free.limits.entries.toLocaleString("en-US"),
    pro: PLANS.pro.limits.entries.toLocaleString("en-US"),
    icon: FileText,
  },
  {
    label: "Readspace articles",
    free: PLANS.free.limits.readspace.toLocaleString("en-US"),
    pro: PLANS.pro.limits.readspace.toLocaleString("en-US"),
    icon: BookOpen,
  },
  {
    label: "Lists",
    free: formatResourceLimit(PLANS.free.limits.lists),
    pro: formatResourceLimit(PLANS.pro.limits.lists),
    icon: ListChecks,
  },
  {
    label: "Trash recovery",
    free: `${PLANS.free.trashRecoveryDays} days`,
    pro: `${PLANS.pro.trashRecoveryDays} days`,
    icon: History,
  },
  {
    label: "Support",
    free: "Standard",
    pro: "Priority",
    icon: Headphones,
  },
];

const freeFeaturesIncluded = [
  "Browser-side encryption for protected content",
  "Markdown, HTML, and JSON highlight exports",
  "Sync across unlocked browser sessions",
  "Unlimited collections and tags",
  "No ads",
];

export default function ProUpgradeDialog({
  open,
  onClose,
}: ProUpgradeDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} size="2xl">
      <div className="flex items-start gap-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-[var(--app-lavender-border)] bg-[var(--app-lavender)] text-[var(--app-primary)]">
          <Sparkles className="size-5" aria-hidden="true" />
        </span>
        <div>
          <DialogTitle className="text-xl/7! text-[var(--app-ink)]!">
            Save more. Find more. Recover longer.
          </DialogTitle>
          <DialogDescription className="text-[var(--app-muted)]!">
            FavLock Pro gives you unlimited bookmarks and highlights, encrypted
            annotations, deeper search, and more space for everything you save.
          </DialogDescription>
        </div>
      </div>

      <DialogBody>
        <div className="overflow-hidden rounded-3xl border border-[var(--app-mint-border)]">
          <table className="w-full table-fixed border-collapse text-left">
            <caption className="sr-only">Free and Pro plan comparison</caption>
            <thead>
              <tr className="bg-[var(--app-lavender)]">
                <th
                  scope="col"
                  className="w-[40%] px-3 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--app-muted)] sm:px-4"
                >
                  Compare
                </th>
                <th
                  scope="col"
                  className="w-[25%] px-2 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--app-muted)] sm:px-4"
                >
                  {PLANS.free.name}
                </th>
                <th
                  scope="col"
                  className="w-[35%] bg-[var(--app-mint)] px-2 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--app-primary)] sm:px-4"
                >
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="size-3.5" aria-hidden="true" />
                    {PLANS.pro.name}
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {comparisonRows.map(({ label, free, pro, icon: Icon }) => (
                <tr
                  key={label}
                  className="border-t border-[color-mix(in_oklab,var(--app-line)_12%,transparent)]"
                >
                  <th
                    scope="row"
                    className="px-3 py-3 text-xs font-semibold text-[var(--app-ink)] sm:px-4 sm:text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <Icon
                        className="size-4 shrink-0 text-[var(--app-primary)]"
                        aria-hidden="true"
                      />
                      {label}
                    </span>
                  </th>
                  <td className="px-2 py-3 text-xs leading-5 text-[var(--app-muted)] sm:px-4 sm:text-sm">
                    {free}
                  </td>
                  <td className="bg-[var(--app-mint)] px-2 py-3 text-xs font-semibold leading-5 text-[var(--app-ink)] sm:px-4 sm:text-sm">
                    {pro}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-start gap-2.5 rounded-2xl border border-[var(--app-sky-border)] bg-[var(--app-sky)] px-3.5 py-3 text-sm leading-5 text-[var(--app-muted)]">
          <Search
            className="mt-0.5 size-4 shrink-0 text-[var(--app-primary)]"
            aria-hidden="true"
          />
          <p>
            <span className="font-semibold text-[var(--app-ink)]">
              Full-content search
            </span>{" "}
            covers documents, tasks, and Readspace articles. Both plans search
            bookmark titles, URLs, tags, collections, and highlighted text in
            Readspace.
          </p>
        </div>

        <div className="mt-4 rounded-2xl border border-[var(--app-mint-border)] bg-[var(--app-mint)] px-3.5 py-3">
          <h3 className="text-sm font-semibold text-[var(--app-ink)]">
            Everything in Free stays included
          </h3>
          <ul className="mt-2.5 grid gap-x-4 gap-y-2 text-sm leading-5 text-[var(--app-muted)] sm:grid-cols-2">
            {freeFeaturesIncluded.map((feature) => (
              <li key={feature} className="flex items-start gap-2">
                <Check
                  className="mt-0.5 size-4 shrink-0 text-[var(--app-primary)]"
                  strokeWidth={2.5}
                  aria-hidden="true"
                />
                {feature}
              </li>
            ))}
          </ul>
        </div>

      </DialogBody>

      <DialogActions>
        <Button type="button" outline onClick={onClose}>
          Not now
        </Button>
        <Button href="/checkout" color="emerald">
          <Sparkles data-slot="icon" aria-hidden="true" />
          Upgrade to Pro
        </Button>
      </DialogActions>
      <p className="mt-3 text-center text-xs text-[var(--app-muted)] sm:text-right">
        Secure checkout · 14-day money-back guarantee
      </p>
    </Dialog>
  );
}
