import { ArrowDownUp, Check, ListOrdered } from "lucide-react";
import {
  SIDEBAR_SORT_LABELS,
  SIDEBAR_SORT_MODES,
  type SidebarSortMode,
} from "../lib/sidebarSort";
import {
  Dropdown,
  DropdownButton,
  DropdownDivider,
  DropdownHeading,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
  DropdownSection,
} from "./ui/dropdown";

interface SidebarSortMenuProps {
  /** Plural section name, e.g. "collections". */
  label: string;
  mode: SidebarSortMode;
  canArrange: boolean;
  onChangeMode: (mode: SidebarSortMode) => void;
  onArrange: () => void;
}

export default function SidebarSortMenu({
  label,
  mode,
  canArrange,
  onChangeMode,
  onArrange,
}: SidebarSortMenuProps) {
  return (
    <Dropdown>
      <DropdownButton
        plain
        className="theme-button-icon inline-flex size-10 items-center justify-center p-0!"
        aria-label={`Sort ${label}: ${SIDEBAR_SORT_LABELS[mode]}`}
        title={`Sort ${label}`}
      >
        <ArrowDownUp size={16} aria-hidden="true" />
      </DropdownButton>
      <DropdownMenu anchor="bottom end" className="min-w-56">
        <DropdownSection>
          <DropdownHeading>Sort {label} by</DropdownHeading>
          {SIDEBAR_SORT_MODES.map((option) => (
            <DropdownItem key={option} onClick={() => onChangeMode(option)}>
              <Check
                data-slot="icon"
                aria-hidden="true"
                className={mode === option ? "" : "invisible"}
              />
              <DropdownLabel>
                {SIDEBAR_SORT_LABELS[option]}
                {mode === option && <span className="sr-only"> (current)</span>}
              </DropdownLabel>
            </DropdownItem>
          ))}
        </DropdownSection>
        <DropdownDivider />
        <DropdownItem disabled={!canArrange} onClick={onArrange}>
          <ListOrdered data-slot="icon" aria-hidden="true" />
          <DropdownLabel>Arrange custom order…</DropdownLabel>
        </DropdownItem>
      </DropdownMenu>
    </Dropdown>
  );
}
