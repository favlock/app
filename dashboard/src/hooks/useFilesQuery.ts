import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../context/useAuth";
import { fetchEncryptedFiles } from "../lib/filesApi";

export const filesQueryKey = (userId: string | undefined) => ["files", userId];

export function useFiles() {
  const { session, user, isLocalAccount } = useAuth();
  return useQuery({
    queryKey: filesQueryKey(user?.id),
    enabled: !!user && !isLocalAccount && !!session?.access_token,
    queryFn: () => fetchEncryptedFiles(session?.access_token ?? ""),
  });
}
