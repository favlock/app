import { useId, useSyncExternalStore } from "react";
import {
  SIDEBAR_ITEM_LIMIT_OPTIONS,
  getSidebarItemLimit,
  setSidebarItemLimit,
  subscribeSidebarItemLimit,
} from "../lib/sidebarItemLimit";

export default function SidebarItemLimitPreference() {
  const limit = useSyncExternalStore(
    subscribeSidebarItemLimit,
    getSidebarItemLimit,
  );
  const id = useId();

  return (
    <fieldset className="mb-6 border-b border-[var(--app-mint-border)] pb-6" aria-describedby={`${id}-description`}>
      <legend className="text-sm font-semibold liquid-ink">Sidebar lists</legend>
      <p id={`${id}-description`} className="mt-1 text-sm liquid-muted">
        Choose how many collections and tags the sidebar shows before
        &ldquo;Show more&rdquo;. Saved in this browser.
      </p>
      <div className="appearance-control mt-4">
        {SIDEBAR_ITEM_LIMIT_OPTIONS.map((value) => (
          <label key={value} className="appearance-option">
            <input
              type="radio"
              name={id}
              value={value}
              checked={limit === value}
              onChange={() => setSidebarItemLimit(value)}
              className="sr-only"
            />
            <span>{value === "all" ? "All" : value}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
