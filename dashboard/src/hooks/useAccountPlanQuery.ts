import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../context/useAuth";
import { fetchAccountPlan } from "../lib/accountPlanApi";
import { LOCAL_PLAN } from "@favlock/shared";

export const accountPlanQueryKey = (userId: string | undefined) => [
  "account-plan",
  userId,
];

export const useAccountPlan = () => {
  const { session, user, isLocalAccount } = useAuth();

  return useQuery({
    queryKey: accountPlanQueryKey(user?.id),
    enabled: !!user && (isLocalAccount || !!session?.access_token),
    staleTime: 1000 * 60 * 5,
    queryFn: () => isLocalAccount
      ? Promise.resolve(LOCAL_PLAN)
      : fetchAccountPlan(session?.access_token ?? ""),
  });
};
