import { useContext } from "react";
import { DuplicatePreviewContext } from "./DuplicatePreviewContext";

export function useSharedDuplicatePreview() {
  const context = useContext(DuplicatePreviewContext);
  if (!context) {
    throw new Error(
      "useSharedDuplicatePreview must be used within DuplicatePreviewProvider",
    );
  }
  return context;
}
