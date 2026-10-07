import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useAuth } from "../context/useAuth";
import {
  fetchBillingOverview,
  fetchBillingTransactions,
} from "../lib/billingManagementApi";

export const billingOverviewQueryKey = (userId: string | undefined) => [
  "billing-overview",
  userId,
];

export const billingTransactionsQueryKey = (
  userId: string | undefined,
  page: number,
) => ["billing-transactions", userId, page];

export const useBillingOverview = (enabled: boolean) => {
  const { session, user } = useAuth();

  return useQuery({
    queryKey: billingOverviewQueryKey(user?.id),
    enabled: enabled && !!user && !!session?.access_token,
    staleTime: 1000 * 60,
    queryFn: () => fetchBillingOverview(session?.access_token ?? ""),
  });
};

export const useBillingTransactions = (enabled: boolean, page: number) => {
  const { session, user } = useAuth();

  return useQuery({
    queryKey: billingTransactionsQueryKey(user?.id, page),
    enabled: enabled && !!user && !!session?.access_token,
    staleTime: 1000 * 60,
    placeholderData: keepPreviousData,
    queryFn: () => fetchBillingTransactions(session?.access_token ?? "", page),
  });
};
