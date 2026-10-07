import { useQueryClient } from "@tanstack/react-query";
import { ExternalLink, ReceiptText } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { useAccountPlan } from "../hooks/useAccountPlanQuery";
import {
  billingOverviewQueryKey,
  useBillingOverview,
} from "../hooks/useBillingManagementQuery";
import {
  billingSubscriptionQueryKey,
  useBillingSubscription,
} from "../hooks/useBillingSubscriptionQuery";
import {
  cancelSubscriptionAtPeriodEnd,
  createBillingPortalLink,
  formatMoney,
  resumeSubscription,
} from "../lib/billingManagementApi";
import { getCreemCustomerPortalUrl } from "../lib/creemBilling";
import BillingHistory from "./BillingHistory";
import ConfirmDialog from "./ConfirmDialog";
import { Button } from "./ui/button";

const BILLING_PERIOD_LABELS: Record<string, string> = {
  "every-month": "month",
  "every-three-months": "3 months",
  "every-six-months": "6 months",
  "every-year": "year",
};

const CANCELABLE_STATUSES = new Set(["active", "trialing", "past_due"]);
// Statuses that grant Pro, as set by apply_subscription_event.
const PRO_STATUSES = new Set(["active", "trialing", "scheduled_cancel", "past_due"]);
// Lapsed for non-payment; Creem recovers them once a payment succeeds.
const PAYMENT_RECOVERY_STATUSES = new Set(["past_due", "unpaid", "expired"]);

interface InactiveSummary {
  title: string;
  message: string;
  next: "plans" | "support" | null;
}

// Any record other than canceled blocks a new checkout on the server
// (can_start_pro_checkout), so only canceled or missing records point to plans.
function inactiveSummary(status: string | null, hasPro: boolean): InactiveSummary {
  if (status === null) {
    return hasPro
      ? { title: "No active subscription", message: "This Pro access is not connected to a Creem subscription.", next: null }
      : { title: "No active subscription", message: "You're on the Free plan.", next: "plans" };
  }
  if (status === "canceled") {
    return {
      title: "No active subscription",
      message: "Your previous Creem subscription has ended. Past receipts remain available from Creem.",
      next: "plans",
    };
  }
  if (status === "unpaid" || status === "expired") {
    return {
      title: "Payment needed",
      message: "Your subscription lapsed because a payment did not go through. Update your payment method in Creem to restart it.",
      next: null,
    };
  }
  if (status === "paused") {
    return { title: "Subscription paused", message: "Contact support to resume it.", next: "support" };
  }
  if (status === "refunded") {
    // Hourly reconciliation clears it once Creem reports the subscription canceled.
    return {
      title: "Subscription refunded",
      message: "You can subscribe again once Creem confirms this subscription has ended, usually within an hour.",
      next: "support",
    };
  }
  if (status === "disputed") {
    return {
      title: "Payment under review",
      message: "A payment on this subscription is disputed. Contact support to resolve it.",
      next: "support",
    };
  }
  return { title: "Subscription needs attention", message: "Contact support to resolve it.", next: "support" };
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
  }).format(date);
}

export default function BillingManagementSection() {
  const { user, session } = useAuth();
  const { data: accountPlan } = useAccountPlan();
  const {
    data: subscription,
    isLoading,
    isError,
  } = useBillingSubscription();
  const queryClient = useQueryClient();
  const hasCreemBilling = subscription?.provider === "creem";
  const { data: overview } = useBillingOverview(hasCreemBilling);
  const [portalPending, setPortalPending] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelPending, setCancelPending] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [renewPending, setRenewPending] = useState(false);
  const [renewError, setRenewError] = useState<string | null>(null);
  // The stored subscription changes only when Creem's webhook arrives. Until
  // then, show the requested outcome and hide the action, because Creem would
  // reject a second request.
  const [pendingChange, setPendingChange] = useState<"cancel" | "renew" | null>(null);
  const hasPro = accountPlan?.id === "pro";
  const status = subscription?.status ?? null;
  const grantsPro = status !== null && PRO_STATUSES.has(status);
  const storedEnding =
    status === "scheduled_cancel" || !!subscription?.cancelAtPeriodEnd;
  const endsAtPeriodEnd =
    pendingChange === "cancel" || (storedEnding && pendingChange !== "renew");
  const periodEnd = formatDate(subscription?.currentPeriodEnd ?? null);
  const nextPayment = formatDate(overview?.nextPaymentAt ?? null);
  const canCancel =
    hasCreemBilling &&
    status !== null &&
    CANCELABLE_STATUSES.has(status) &&
    !subscription?.cancelAtPeriodEnd &&
    pendingChange !== "cancel";
  const canRenew =
    hasCreemBilling && status === "scheduled_cancel" && pendingChange !== "renew";
  const needsPaymentMethod =
    hasCreemBilling && status !== null && PAYMENT_RECOVERY_STATUSES.has(status);
  const inactive = grantsPro ? null : inactiveSummary(status, hasPro);

  const refreshBilling = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: billingSubscriptionQueryKey(user?.id) }),
      queryClient.invalidateQueries({ queryKey: billingOverviewQueryKey(user?.id) }),
    ]);

  const openCustomerPortal = async () => {
    if (!hasCreemBilling) {
      window.open(getCreemCustomerPortalUrl(), "_blank", "noopener,noreferrer");
      return;
    }
    // Open the tab during the click so popup blockers allow it, then point it
    // at the pre-authenticated link once the server returns it.
    const portalWindow = window.open("", "_blank");
    if (portalWindow) portalWindow.opener = null;
    setPortalPending(true);
    setPortalError(null);
    try {
      const url = await createBillingPortalLink(session?.access_token ?? "");
      if (portalWindow) portalWindow.location.href = url;
      else window.location.assign(url);
    } catch (error) {
      portalWindow?.close();
      setPortalError(
        error instanceof Error
          ? error.message
          : "Creem billing could not be opened. Please try again.",
      );
    } finally {
      setPortalPending(false);
    }
  };

  const confirmCancel = async () => {
    setCancelPending(true);
    setCancelError(null);
    try {
      await cancelSubscriptionAtPeriodEnd(session?.access_token ?? "");
      setCancelOpen(false);
      setPendingChange("cancel");
      // The webhook updates the stored subscription; refresh both views.
      await refreshBilling();
    } catch (error) {
      setCancelError(
        error instanceof Error
          ? error.message
          : "Your subscription could not be canceled. Please try again.",
      );
    } finally {
      setCancelPending(false);
    }
  };

  const renewSubscription = async () => {
    setRenewPending(true);
    setRenewError(null);
    try {
      await resumeSubscription(session?.access_token ?? "");
      setPendingChange("renew");
      await refreshBilling();
    } catch (error) {
      setRenewError(
        error instanceof Error
          ? error.message
          : "Your subscription could not be renewed. Please try again.",
      );
    } finally {
      setRenewPending(false);
    }
  };

  return (
    <section>
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-700 dark:text-emerald-300">
          <ReceiptText className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h3 className="text-sm font-semibold liquid-ink">Billing</h3>
          <p className="mt-1 text-sm liquid-muted">
            Your subscription, payments, and receipts.
          </p>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-[color-mix(in_oklab,var(--app-line)_16%,transparent)] bg-[color-mix(in_oklab,var(--app-card)_55%,transparent)] p-5">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            {isLoading ? (
              <p className="text-sm liquid-muted">Loading billing details…</p>
            ) : !inactive ? (
              <>
                <p className="text-lg font-semibold liquid-ink">FavLock Pro</p>
                {overview?.plan ? (
                  <p className="mt-2 text-sm font-medium liquid-ink">
                    {formatMoney(overview.plan.amount, overview.plan.currency)}
                    {overview.plan.billingPeriod
                      ? ` / ${BILLING_PERIOD_LABELS[overview.plan.billingPeriod] ?? overview.plan.billingPeriod}`
                      : ""}
                    {nextPayment && !endsAtPeriodEnd ? (
                      <span className="font-normal liquid-muted"> · Next payment {nextPayment}</span>
                    ) : null}
                  </p>
                ) : null}
                {pendingChange === "renew" && storedEnding ? (
                  <p
                    className="mt-3 text-sm font-medium text-emerald-700 dark:text-emerald-300"
                    role="status"
                  >
                    Your subscription is renewed and continues after{periodEnd ? ` ${periodEnd}` : " this billing period"}.
                  </p>
                ) : endsAtPeriodEnd ? (
                  <p className="mt-3 text-sm font-medium text-amber-700 dark:text-amber-300">
                    Your subscription will end{periodEnd ? ` on ${periodEnd}` : " at the end of the billing period"}.
                  </p>
                ) : status === "past_due" ? (
                  <p className="mt-3 text-sm font-medium text-amber-700 dark:text-amber-300">
                    A payment needs attention. Pro remains available during Creem&apos;s retry period.
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <p className="text-lg font-semibold liquid-ink">{inactive.title}</p>
                <p className="mt-2 max-w-md text-sm liquid-muted">
                  {inactive.message}{" "}
                  {inactive.next === "plans" ? (
                    <Link
                      to="/settings/usage"
                      className="font-medium text-emerald-700 hover:underline dark:text-emerald-300"
                    >
                      Compare plans
                    </Link>
                  ) : inactive.next === "support" ? (
                    <Link
                      to="/support"
                      className="font-medium text-emerald-700 hover:underline dark:text-emerald-300"
                    >
                      Contact support
                    </Link>
                  ) : null}
                </p>
              </>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              type="button"
              outline
              disabled={portalPending}
              onClick={() => void openCustomerPortal()}
            >
              <ExternalLink data-slot="icon" aria-hidden="true" />
              {portalPending ? "Opening…" : "Receipts & billing"}
            </Button>
          </div>
        </div>

        {isError ? (
          <p className="mt-4 text-sm text-red-600 dark:text-red-300" role="alert">
            Billing status could not be loaded. Your plan limits are unaffected.
          </p>
        ) : null}
        {portalError ? (
          <p className="mt-4 text-sm text-red-600 dark:text-red-300" role="alert">
            {portalError}
          </p>
        ) : null}
        {renewError ? (
          <p className="mt-4 text-sm text-red-600 dark:text-red-300" role="alert">
            {renewError}
          </p>
        ) : null}
        {needsPaymentMethod || canRenew || canCancel ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {needsPaymentMethod ? (
              <Button
                type="button"
                color="emerald"
                disabled={portalPending}
                onClick={() => void openCustomerPortal()}
              >
                {portalPending ? "Opening…" : "Update payment method"}
              </Button>
            ) : null}
            {canRenew ? (
              <Button
                type="button"
                color="emerald"
                disabled={renewPending}
                onClick={() => void renewSubscription()}
              >
                {renewPending ? "Renewing…" : "Renew subscription"}
              </Button>
            ) : null}
            {canCancel ? (
              <Button
                type="button"
                outline
                onClick={() => {
                  setCancelError(null);
                  setCancelOpen(true);
                }}
              >
                Cancel subscription
              </Button>
            ) : null}
          </div>
        ) : null}
        <p className="mt-4 text-xs liquid-muted">
          Creem is the merchant of record and handles payments, receipts,
          refunds, and tax. Billing remains available if cloud access is restricted.
        </p>
      </div>

      {hasCreemBilling ? <BillingHistory /> : null}

      <ConfirmDialog
        open={cancelOpen}
        title="Cancel FavLock Pro?"
        description={`You keep Pro until ${periodEnd ?? "the end of your billing period"}. After that your account moves to Free and you won't be charged again. Your existing data remains available.`}
        confirmLabel="Cancel subscription"
        cancelLabel="Keep Pro"
        busyLabel="Canceling…"
        busy={cancelPending}
        error={cancelError}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => void confirmCancel()}
      />
    </section>
  );
}
