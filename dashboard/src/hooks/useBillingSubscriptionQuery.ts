import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../context/useAuth";
import {
  fetchBillingSubscription,
  type BillingSubscription,
} from "../lib/billingSubscriptionApi";

export type { BillingSubscription } from "../lib/billingSubscriptionApi";

export const billingSubscriptionQueryKey = (userId: string | undefined) => [
  "billing-subscription",
  userId,
];

export const useBillingSubscription = () => {
  const { session, user } = useAuth();

  return useQuery({
    queryKey: billingSubscriptionQueryKey(user?.id),
    enabled: !!user && !!session?.access_token,
    staleTime: 1000 * 60,
    queryFn: (): Promise<BillingSubscription | null> =>
      fetchBillingSubscription(session?.access_token ?? ""),
  });
};
