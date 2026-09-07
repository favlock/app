import { useContext } from "react";
import { DuplicateScanContext } from "./DuplicateScanContext";

export function useDuplicateScan() {
  const context = useContext(DuplicateScanContext);
  if (!context) {
    throw new Error("useDuplicateScan must be used within DuplicateScanProvider");
  }
  return context;
}
