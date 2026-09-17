import { useContext } from "react";
import { LinkHealthContext } from "./LinkHealthContext";

export function useLinkHealth() {
  const context = useContext(LinkHealthContext);
  if (!context) {
    throw new Error("useLinkHealth must be used within a LinkHealthProvider");
  }
  return context;
}
