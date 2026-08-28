import { PLANS } from "@favlock/shared";
import { CreditCard, ExternalLink, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { useAccountPlan } from "../hooks/useAccountPlanQuery";
import { useBillingSubscription } from "../hooks/useBillingSubscriptionQuery";
import { CREEM_PRO_PRODUCT_URL } from "../lib/appUrls";
import {
  buildCreemCheckoutUrl,
  getCreemCustomerPortalUrl,
} from "../lib/creemBilling";
import { Button } from "./ui/button";

const ACTIVE_STATUSES = new Set([
  "active",
  "trialing",
  "scheduled_cancel",
  "past_due",
]);

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
  }).format(date);
}

export default function BillingSection() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const checkoutReturned = searchParams.get("billing") === "success";
  const { data: accountPlan, refetch: refetchPlan } = useAccountPlan();
  const {
    data: subscription,
    isLoading,
    isError,
    refetch: refetchSubscription,
  } = useBillingSubscription();
  const [actionError, setActionError] = useState<string | null>(null);
  const hasPro = accountPlan?.id === "pro";
  const hasActiveBilling = subscription
    ? ACTIVE_STATUSES.has(subscription.status)
    : false;
  const periodEnd = formatDate(subscription?.currentPeriodEnd ?? null);

  useEffect(() => {
    if (!checkoutReturned || hasPro) return;

    let attempts = 0;
    const refresh = () => {
      attempts += 1;
      void Promise.all([refetchPlan(), refetchSubscription()]);
      if (attempts >= 10) window.clearInterval(intervalId);
    };
    refresh();
    const intervalId = window.setInterval(refresh, 2000);
    return () => window.clearInterval(intervalId);
  }, [checkoutReturned, hasPro, refetchPlan, refetchSubscription]);

  const openCheckout = () => {
    setActionError(null);
    try {
      if (!user) throw new Error("Sign in before upgrading to Pro.");
      const url = buildCreemCheckoutUrl(CREEM_PRO_PRODUCT_URL, user.id);
      window.location.assign(url);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Could not open billing. Please try again.",
      );
    }
  };

  const openCustomerPortal = () => {
    window.location.assign(getCreemCustomerPortalUrl());
  };

  return (
    <section>
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-700">
          <Sparkles className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h3 className="text-sm font-semibold liquid-ink">Plan and billing</h3>
          <p className="mt-1 text-sm liquid-muted">
            Upgrade your limits or manage an existing subscription.
          </p>
        </div>
      </div>

      {checkoutReturned ? (
        <div
          className={`mt-5 rounded-xl border px-4 py-3 text-sm ${
            hasPro
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
              : "border-amber-500/30 bg-amber-500/10 text-amber-800"
          }`}
          role="status"
          aria-live="polite"
        >
          {hasPro
            ? "Pro is active. Your new limits are ready."
            : "Payment received. We are confirming your Pro access with Creem; this usually takes a few seconds."}
        </div>
      ) : null}

      <div className="mt-5 rounded-2xl border border-[color-mix(in_oklab,var(--app-line)_16%,transparent)] bg-[color-mix(in_oklab,var(--app-card)_55%,transparent)] p-5">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-lg font-semibold liquid-ink">
                {hasPro ? "FavLock Pro" : "Upgrade to Pro"}
              </p>
              <span className="rounded-full bg-emerald-500/12 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                {hasPro ? "Active" : "More room"}
              </span>
            </div>
            <p className="mt-2 max-w-md text-sm liquid-muted">
              {PLANS.pro.limits.bookmarks.toLocaleString("en-US")} bookmarks, {" "}
              {PLANS.pro.limits.entries.toLocaleString("en-US")} documents and
              tasks, {PLANS.pro.limits.readspace.toLocaleString("en-US")} {" "}
              saved articles, and {PLANS.pro.trashRecoveryDays}-day Trash
              recovery.
            </p>
            {subscription?.status === "scheduled_cancel" ||
            subscription?.cancelAtPeriodEnd ? (
              <p className="mt-3 text-sm font-medium text-amber-700">
                Your subscription will end{periodEnd ? ` on ${periodEnd}` : " at the end of the billing period"}.
              </p>
            ) : subscription?.status === "past_due" ? (
              <p className="mt-3 text-sm font-medium text-amber-700">
                A payment needs attention. Pro remains available during Creem&apos;s retry period.
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            {!hasPro ? (
              <Button
                type="button"
                color="emerald"
                disabled={isLoading}
                onClick={openCheckout}
              >
                <CreditCard data-slot="icon" aria-hidden="true" />
                Upgrade to Pro
              </Button>
            ) : null}
            {subscription ? (
              <Button
                type="button"
                outline
                onClick={openCustomerPortal}
              >
                <ExternalLink data-slot="icon" aria-hidden="true" />
                Receipts &amp; billing
              </Button>
            ) : null}
          </div>
        </div>

        {hasPro && !subscription ? (
          <p className="mt-4 text-xs liquid-muted">
            This Pro access is not connected to a Creem subscription.
          </p>
        ) : null}
        {isError ? (
          <p className="mt-4 text-sm text-red-600" role="alert">
            Billing status could not be loaded. Your plan limits are unaffected.
          </p>
        ) : null}
        {actionError ? (
          <p className="mt-4 text-sm text-red-600" role="alert">
            {actionError}
          </p>
        ) : null}
        {!hasPro && subscription && !hasActiveBilling ? (
          <p className="mt-4 text-xs liquid-muted">
            Your previous Creem subscription is not active. You can start a new
            checkout or open billing for past invoices.
          </p>
        ) : null}
        <p className="mt-4 text-xs liquid-muted">
          Creem is the merchant of record and handles checkout, tax collection,
          receipts, refunds, and subscription billing. Use the same email as
          your FavLock account at checkout.
        </p>
      </div>
    </section>
  );
}
