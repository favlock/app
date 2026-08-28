import { PLANS } from "@favlock/shared";
import { Check, Sparkles } from "lucide-react";
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
    free: PLANS.free.limits.bookmarks.toLocaleString("en-US"),
    pro: PLANS.pro.limits.bookmarks.toLocaleString("en-US"),
  },
  {
    label: "Documents and tasks",
    free: PLANS.free.limits.entries.toLocaleString("en-US"),
    pro: PLANS.pro.limits.entries.toLocaleString("en-US"),
  },
  {
    label: "Saved articles",
    free: PLANS.free.limits.readspace.toLocaleString("en-US"),
    pro: PLANS.pro.limits.readspace.toLocaleString("en-US"),
  },
  {
    label: "Lists",
    free: PLANS.free.limits.lists.toLocaleString("en-US"),
    pro: "Unlimited",
  },
  {
    label: "Search",
    free: "Titles and tags",
    pro: "Full content",
  },
  {
    label: "Trash recovery",
    free: `${PLANS.free.trashRecoveryDays} days`,
    pro: `${PLANS.pro.trashRecoveryDays} days`,
  },
];

export default function ProUpgradeDialog({
  open,
  onClose,
}: ProUpgradeDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} size="2xl">
      <div className="flex items-start gap-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--app-primary)] text-white shadow-md shadow-[color-mix(in_oklab,var(--app-primary)_22%,transparent)]">
          <Sparkles className="size-5" aria-hidden="true" />
        </span>
        <div>
          <DialogTitle className="text-xl/7! text-[var(--app-ink)]!">
            Do more with FavLock Pro
          </DialogTitle>
          <DialogDescription className="text-[var(--app-muted)]!">
            Keep everything you love about Free, with more room, deeper search,
            and longer recovery.
          </DialogDescription>
        </div>
      </div>

      <DialogBody>
        <div className="overflow-hidden rounded-2xl border border-[color-mix(in_oklab,var(--app-line)_16%,transparent)]">
          <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(5.5rem,0.8fr)_minmax(6.5rem,0.9fr)] bg-[color-mix(in_oklab,var(--app-card-strong)_45%,white)] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--app-muted)] sm:px-5">
            <span>Benefit</span>
            <span>{PLANS.free.name}</span>
            <span className="text-[var(--app-primary)]">{PLANS.pro.name}</span>
          </div>
          {comparisonRows.map((row) => (
            <div
              key={row.label}
              className="grid grid-cols-[minmax(0,1.3fr)_minmax(5.5rem,0.8fr)_minmax(6.5rem,0.9fr)] items-center border-t border-[color-mix(in_oklab,var(--app-line)_12%,transparent)] px-4 py-3 text-sm sm:px-5"
            >
              <span className="pr-3 font-medium text-[var(--app-ink)]">
                {row.label}
              </span>
              <span className="pr-3 text-[var(--app-muted)]">{row.free}</span>
              <span className="flex items-center gap-1.5 font-semibold text-[var(--app-ink)]">
                <Check
                  className="size-4 shrink-0 text-[var(--app-primary)]"
                  strokeWidth={2.5}
                  aria-hidden="true"
                />
                {row.pro}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 rounded-xl bg-[color-mix(in_oklab,var(--app-primary)_7%,var(--app-card))] px-4 py-3 text-sm text-[var(--app-ink)]">
          <span className="flex items-center gap-2">
            <Check className="size-4 text-[var(--app-primary)]" aria-hidden="true" />
            Unlimited collections and tags
          </span>
          <span className="flex items-center gap-2">
            <Check className="size-4 text-[var(--app-primary)]" aria-hidden="true" />
            No ads
          </span>
        </div>
      </DialogBody>

      <DialogActions>
        <Button type="button" plain onClick={onClose}>
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
