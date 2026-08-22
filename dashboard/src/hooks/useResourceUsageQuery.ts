import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../context/useAuth";
import { fetchResourceUsage } from "../lib/resourceUsageApi";

export const RESOURCE_USAGE_QUERY_KEY = ["resource-usage"] as const;

export const useResourceUsage = () => {
  const { session, user } = useAuth();

  return useQuery({
    queryKey: [...RESOURCE_USAGE_QUERY_KEY, user?.id],
    enabled: !!user && !!session?.access_token,
    queryFn: () => fetchResourceUsage(session?.access_token ?? ""),
  });
};
