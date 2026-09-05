import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../context/useAuth";
import { fetchResourceUsage } from "../lib/resourceUsageApi";
import { readLocalResourceUsage } from "../lib/localVault";

export const RESOURCE_USAGE_QUERY_KEY = ["resource-usage"] as const;

export const useResourceUsage = () => {
  const { session, user, isLocalAccount } = useAuth();

  return useQuery({
    queryKey: [...RESOURCE_USAGE_QUERY_KEY, user?.id],
    enabled: !!user && (isLocalAccount || !!session?.access_token),
    queryFn: () => isLocalAccount
      ? readLocalResourceUsage(user!.id)
      : fetchResourceUsage(session?.access_token ?? ""),
  });
};
