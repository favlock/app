import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/useAuth";
import {
  fetchAccountOnboardingProgress,
  updateAccountOnboardingProgress,
} from "../lib/accountOnboardingApi";
import {
  acknowledgeCloudOnboardingProgress,
  applyCloudOnboardingProgress,
  ONBOARDING_STATE_CHANGED_EVENT,
  ONBOARDING_STATE_VERSION,
  readOnboardingState,
} from "../lib/onboarding";

export const accountOnboardingQueryKey = (userId: string | undefined) => [
  "account-onboarding",
  userId,
];

export function useOnboardingProgressSync() {
  const { cloudStatus, session, user } = useAuth();
  const [localRevision, setLocalRevision] = useState(0);
  const hydratedRemoteRef = useRef<unknown>(null);
  const queryClient = useQueryClient();
  const cloudAvailable =
    cloudStatus === "available" && !!user && !!session?.access_token;

  const progressQuery = useQuery({
    queryKey: accountOnboardingQueryKey(user?.id),
    enabled: cloudAvailable,
    staleTime: 0,
    retry: 1,
    queryFn: () =>
      fetchAccountOnboardingProgress(session?.access_token ?? ""),
  });

  const progressMutation = useMutation({
    mutationFn: (transition: {
      completedSteps?: ReturnType<typeof readOnboardingState>["cloudSync"]["pendingCompletedSteps"];
      dismissed?: boolean;
    }) =>
      updateAccountOnboardingProgress(session?.access_token ?? "", {
        version: ONBOARDING_STATE_VERSION,
        ...transition,
      }),
    onSuccess: (progress) => {
      if (user?.id) {
        queryClient.setQueryData(accountOnboardingQueryKey(user.id), progress);
        acknowledgeCloudOnboardingProgress(user.id, progress);
      }
    },
  });
  const mutateProgress = progressMutation.mutate;
  const progressMutationPending = progressMutation.isPending;

  useEffect(() => {
    const handleStateChange = (event: Event) => {
      if (event instanceof CustomEvent && event.detail?.userId === user?.id) {
        setLocalRevision((revision) => revision + 1);
      }
    };
    window.addEventListener(ONBOARDING_STATE_CHANGED_EVENT, handleStateChange);
    return () =>
      window.removeEventListener(
        ONBOARDING_STATE_CHANGED_EVENT,
        handleStateChange,
      );
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !progressQuery.data) return;
    if (hydratedRemoteRef.current === progressQuery.data) return;
    hydratedRemoteRef.current = progressQuery.data;
    applyCloudOnboardingProgress(user.id, progressQuery.data);
  }, [progressQuery.data, user?.id]);

  useEffect(() => {
    if (
      !cloudAvailable ||
      !user?.id ||
      !progressQuery.data ||
      progressMutationPending
    ) {
      return;
    }
    const state = readOnboardingState(user.id);
    const completedSteps = state.cloudSync.pendingCompletedSteps;
    const pendingDismissal = state.cloudSync.pendingDismissal;
    if (completedSteps.length === 0 && pendingDismissal === null) return;

    mutateProgress({
      ...(completedSteps.length > 0 ? { completedSteps } : {}),
      ...(pendingDismissal !== null ? { dismissed: pendingDismissal } : {}),
    });
  }, [
    cloudAvailable,
    localRevision,
    mutateProgress,
    progressMutationPending,
    progressQuery.data,
    user?.id,
  ]);

  useEffect(() => {
    hydratedRemoteRef.current = null;
  }, [user?.id]);

  return {
    ready:
      !cloudAvailable || progressQuery.isSuccess || progressQuery.isError,
    syncError: progressQuery.error ?? progressMutation.error ?? null,
  };
}
