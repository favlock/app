import { Check } from "lucide-react";
import {
  Dropdown,
  DropdownFieldButton,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from "./ui/dropdown";
import { SORT_LABELS, type BookmarkSortOrder } from "../lib/bookmarkSorting";
import type { BookmarkSortPreference } from "../hooks/useBookmarkSorting";

export default function BookmarkSortControl({
  value,
  onChange,
  mixedLibrary,
  favorites,
  search,
  disabled = false,
}: {
  value: BookmarkSortPreference;
  onChange: (value: BookmarkSortPreference) => void;
  mixedLibrary: boolean;
  favorites: boolean;
  search: boolean;
  disabled?: boolean;
}) {
  const defaultLabel = search
    ? "Default search order"
    : favorites ? "Recently favorited" : "Newest first";
  const label = value.order === "default" ? defaultLabel : SORT_LABELS[value.order];
  const orders = (Object.keys(SORT_LABELS) as BookmarkSortOrder[]).filter(
    (order) =>
      (!order.startsWith("favorited-") || favorites) &&
      (order !== "most-used" || !search) &&
      (!order.startsWith("website-") || !mixedLibrary || value.bookmarksOnly),
  );

  return (
    <div
      className="flex flex-wrap items-center gap-3 px-3 lg:px-0"
      aria-label={search ? "Bookmark sorting" : "Library sorting"}
    >
      <div className="w-full sm:w-auto sm:min-w-64">
        <Dropdown>
          <DropdownFieldButton disabled={disabled} aria-label={`Sort${search ? " bookmarks" : ""}: ${label}`}>
            Sort: {label}
          </DropdownFieldButton>
          <DropdownMenu anchor="bottom start">
            {orders.map((order) => {
              const optionLabel = order === "default" ? defaultLabel : SORT_LABELS[order];
              return (
                <DropdownItem
                  key={order}
                  aria-label={`${optionLabel}${value.order === order ? ", selected" : ""}`}
                  onClick={() => onChange({ ...value, order, bookmarksOnly: order === "most-used" && mixedLibrary ? true : value.bookmarksOnly })}
                >
                  {value.order === order && <Check data-slot="icon" aria-hidden="true" />}
                  <DropdownLabel>{optionLabel}</DropdownLabel>
                </DropdownItem>
              );
            })}
          </DropdownMenu>
        </Dropdown>
      </div>
      {mixedLibrary && (
        <label className="flex min-h-11 items-center gap-2 text-sm text-[var(--app-ink)]">
          <input
            type="checkbox"
            disabled={disabled}
            checked={value.bookmarksOnly}
            onChange={(event) => onChange({
              ...value,
              bookmarksOnly: event.target.checked,
              order: !event.target.checked && (value.order.startsWith("website-") || value.order === "most-used")
                ? "default" : value.order,
            })}
          />
          Bookmarks only
        </label>
      )}
      {!favorites && (
        <label className="flex min-h-11 items-center gap-2 text-sm text-[var(--app-ink)]">
          <input
            type="checkbox"
            disabled={disabled}
            checked={value.favoritesFirst}
            onChange={(event) => onChange({ ...value, favoritesFirst: event.target.checked })}
          />
          Favorites first
        </label>
      )}
    </div>
  );
}
