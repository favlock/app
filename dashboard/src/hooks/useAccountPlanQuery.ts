import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../context/useAuth";
import { fetchAccountPlan } from "../lib/accountPlanApi";

export const accountPlanQueryKey = (userId: string | undefined) => [
  "account-plan",
  userId,
];

export const useAccountPlan = () => {
  const { session, user } = useAuth();

  return useQuery({
    queryKey: accountPlanQueryKey(user?.id),
    enabled: !!user && !!session?.access_token,
    staleTime: 1000 * 60 * 5,
    queryFn: () => fetchAccountPlan(session?.access_token ?? ""),
  });
};
