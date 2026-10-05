import { createContext, type ReactNode } from "react";
import { useAccountPlan } from "../hooks/useAccountPlanQuery";
import {
  useDuplicatePreview,
  type DuplicatePreview,
} from "../hooks/useDuplicatePreview";

// eslint-disable-next-line react-refresh/only-export-components
export const DuplicatePreviewContext = createContext<
  DuplicatePreview | undefined
>(undefined);

/**
 * Shares one in-memory duplicate preview between the sidebar and the Library
 * health page for accounts without Pro, so both show the same count without
 * scanning twice. Pro accounts use the persistent duplicate monitor instead.
 */
export function DuplicatePreviewProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { data: accountPlan, isError, isLoading } = useAccountPlan();
  const preview = useDuplicatePreview(
    Boolean(accountPlan && accountPlan.id !== "pro" && !isLoading && !isError),
  );

  return (
    <DuplicatePreviewContext.Provider value={preview}>
      {children}
    </DuplicatePreviewContext.Provider>
  );
}
