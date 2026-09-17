import { Copy, Link2Off } from "lucide-react";
import { Link } from "react-router-dom";

interface LibraryHealthTabsProps {
  activeTab: "duplicates" | "broken-links";
}

const tabs = [
  {
    id: "duplicates",
    label: "Duplicates",
    icon: Copy,
    to: "/library-health/duplicates",
  },
  {
    id: "broken-links",
    label: "Broken links",
    icon: Link2Off,
    to: "/library-health/broken-links",
  },
] as const;

export default function LibraryHealthTabs({ activeTab }: LibraryHealthTabsProps) {
  return (
    <nav aria-label="Library health sections" className="px-4 sm:px-5 lg:px-0">
      <div className="inline-flex w-full rounded-xl border border-[color-mix(in_oklab,var(--app-line)_14%,transparent)] bg-[var(--app-reading)] p-1 sm:w-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = tab.id === activeTab;
          return (
            <Link
              key={tab.id}
              to={tab.to}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-9 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors sm:flex-none ${
                active
                  ? "bg-[var(--app-card)] text-[var(--app-ink)] shadow-sm"
                  : "text-[var(--app-muted)] hover:bg-[var(--app-card)] hover:text-[var(--app-ink)]"
              }`}
            >
              <Icon size={15} aria-hidden="true" />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
