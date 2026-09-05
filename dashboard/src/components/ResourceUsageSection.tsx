import { DEFAULT_PLAN } from "@favlock/shared";
import {
  Bookmark,
  BookOpen,
  FolderClosed,
  Highlighter,
  ListChecks,
  NotebookTabs,
  Tags,
  type LucideIcon,
} from "lucide-react";
import { useResourceUsage } from "../hooks/useResourceUsageQuery";
import { Button } from "./ui/button";
import { useAccountPlan } from "../hooks/useAccountPlanQuery";

type UsageMeterProps = {
  label: string;
  used: number;
  limit: number;
  icon: LucideIcon;
  barClassName: string;
};

function UsageMeter({
  label,
  used,
  limit,
  icon: Icon,
  barClassName,
}: UsageMeterProps) {
  const isUnlimited = limit === 0;
  const isAtLimit = !isUnlimited && used === limit;
  const isOverLimit = !isUnlimited && used > limit;
  const isLimitReached = isAtLimit || isOverLimit;
  const percentage = isUnlimited ? 100 : Math.min(100, (used / limit) * 100);
  const remaining = isUnlimited ? null : Math.max(0, limit - used);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-4">
        <div
          className={`flex items-center gap-2 text-sm font-medium ${
            isLimitReached ? "text-red-600" : "liquid-ink"
          }`}
        >
          <Icon className="size-4" aria-hidden="true" />
          <span>{label}</span>
        </div>
        <span
          className={`text-sm tabular-nums ${
            isLimitReached ? "text-red-600" : "liquid-muted"
          }`}
        >
          <span
            className={`font-semibold ${
              isLimitReached ? "text-red-600" : "liquid-ink"
            }`}
          >
            {used.toLocaleString("en-US")}
          </span>{" "}
          / {isUnlimited ? "Unlimited" : limit.toLocaleString("en-US")}
        </span>
      </div>
      <div
        {...(isUnlimited
          ? { "aria-label": `${label} usage is unlimited` }
          : {
              role: "progressbar",
              "aria-label": isOverLimit
                ? `${label} limit exceeded`
                : isAtLimit
                  ? `${label} limit reached`
                  : `${label} used`,
              "aria-valuemin": 0,
              "aria-valuemax": limit,
              "aria-valuenow": Math.min(used, limit),
            })}
        className="h-2.5 overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--app-line)_12%,transparent)]"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${
            isLimitReached ? "bg-red-500" : barClassName
          } ${isUnlimited ? "opacity-35" : ""}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <p
        className={`mt-1.5 text-xs ${
          isLimitReached ? "font-medium text-red-600" : "liquid-muted"
        }`}
      >
        {remaining === null
          ? "No limit"
          : isOverLimit
            ? `${(used - limit).toLocaleString("en-US")} over limit`
            : isAtLimit
              ? "Limit reached"
              : `${remaining.toLocaleString("en-US")} remaining`}
      </p>
    </div>
  );
}

export default function ResourceUsageSection({ localOnly = false }: { localOnly?: boolean }) {
  const { data, isLoading, isError, isFetching, refetch } = useResourceUsage();
  const {
    data: accountPlan = DEFAULT_PLAN,
    isLoading: isPlanLoading,
    isError: isPlanError,
    refetch: refetchPlan,
  } = useAccountPlan();

  return (
    <section>
      <div>
        <h3 className="text-sm font-semibold liquid-ink">Resource usage</h3>
        <p className="mt-1 text-sm liquid-muted">
          {localOnly
            ? "See how much of each resource is stored in this local vault."
            : "See how much of each account resource you are using."}
        </p>
      </div>

      {isLoading || isPlanLoading ? (
        <div className="mt-5 space-y-5" aria-label="Loading account usage">
          {[0, 1, 2, 3, 4, 5].map((item) => (
            <div key={item} className="space-y-2">
              <div className="h-4 w-36 liquid-skeleton rounded-full" />
              <div className="h-2.5 liquid-skeleton rounded-full" />
            </div>
          ))}
        </div>
      ) : isError || isPlanError || !data ? (
        <div
          role="alert"
          className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600"
        >
          <p>Could not load account usage.</p>
          <Button
            type="button"
            outline
            className="mt-3"
            disabled={isFetching}
            onClick={() => {
              void refetch();
              void refetchPlan();
            }}
          >
            {isFetching ? "Retrying..." : "Try again"}
          </Button>
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          <p className="text-sm liquid-muted">
            {localOnly ? "Storage" : "Plan"}: <span className="font-semibold liquid-ink">{accountPlan.name}</span>
          </p>
          <p className="text-sm liquid-muted">
            {localOnly
              ? "Deleted items are removed immediately"
              : `Trash recovery: ${accountPlan.trashRecoveryDays} days`}
          </p>
          <UsageMeter
            label="Bookmarks"
            used={data.bookmarks}
            limit={accountPlan.limits.bookmarks}
            icon={Bookmark}
            barClassName="bg-[var(--app-primary)]"
          />
          <UsageMeter
            label="Documents and tasks"
            used={data.entries}
            limit={accountPlan.limits.entries}
            icon={NotebookTabs}
            barClassName="bg-emerald-500"
          />
          <UsageMeter
            label="Saved articles"
            used={data.readspace}
            limit={accountPlan.limits.readspace}
            icon={BookOpen}
            barClassName="bg-amber-500"
          />
          {!localOnly ? (
            <UsageMeter
              label="Highlights"
              used={data.highlights}
              limit={accountPlan.limits.highlights}
              icon={Highlighter}
              barClassName="bg-yellow-500"
            />
          ) : null}
          <UsageMeter
            label="Collections"
            used={data.collections}
            limit={accountPlan.limits.collections}
            icon={FolderClosed}
            barClassName="bg-[var(--app-secondary)]"
          />
          <UsageMeter
            label="Tags"
            used={data.tags}
            limit={accountPlan.limits.tags}
            icon={Tags}
            barClassName="bg-[var(--app-accent)]"
          />
          <UsageMeter
            label="Lists"
            used={data.lists}
            limit={accountPlan.limits.lists}
            icon={ListChecks}
            barClassName="bg-sky-500"
          />
        </div>
      )}
    </section>
  );
}
