import { useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { AuthLayout } from "../components/ui/auth-layout";
import { Heading } from "../components/ui/heading";
import { Text } from "../components/ui/text";
import { useAuth } from "../context/useAuth";
import { useAccountPlan } from "../hooks/useAccountPlanQuery";
import { useBillingSubscription } from "../hooks/useBillingSubscriptionQuery";
import { createProCheckout } from "../lib/checkoutApi";
import { favLockAuth } from "../lib/favLockAuth";

export default function ProCheckout() {
  const { user, session } = useAuth();
  const { data: accountPlan, isLoading: planLoading } = useAccountPlan();
  const { data: subscription, isLoading: subscriptionLoading } = useBillingSubscription();
  const checkout = useRef<Promise<string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const billingKnown = !planLoading && !subscriptionLoading;
  // The website cannot see the plan, so its Upgrade link also reaches accounts
  // that already have Pro or a subscription to resolve first. The server still
  // refuses those checkouts (can_start_pro_checkout); this avoids the attempt.
  const existingBillingPath = !billingKnown
    ? null
    : accountPlan?.id === "pro"
      ? "/settings/usage"
      : subscription && subscription.status !== "canceled"
        ? "/settings/billing"
        : null;

  useEffect(() => {
    if (!user || !billingKnown || existingBillingPath) return;
    let active = true;
    checkout.current ??= createProCheckout(session?.access_token ?? "", crypto.randomUUID());
    void checkout.current.then((url) => {
      if (active && favLockAuth.getLocalUser()?.id === user.id) window.location.assign(url);
    }).catch((checkoutError: unknown) => {
      if (!active) return;
      setError(
        checkoutError instanceof Error
          ? checkoutError.message
          : "Could not open checkout. Please try again.",
      );
    });
    return () => { active = false; };
  }, [user, session?.access_token, billingKnown, existingBillingPath]);

  if (existingBillingPath) return <Navigate replace to={existingBillingPath} />;

  return (
    <AuthLayout>
      <div className="w-full text-center">
        <Heading>{error ? "Checkout unavailable" : "Opening checkout"}</Heading>
        <Text className="mt-2">
          {error ?? "Taking you to secure Pro checkout..."}
        </Text>
        {error ? (
          <Link
            to="/settings/usage"
            className="mt-5 inline-block font-medium text-emerald-700 dark:text-emerald-300 hover:underline"
          >
            Back to settings
          </Link>
        ) : null}
      </div>
    </AuthLayout>
  );
}
