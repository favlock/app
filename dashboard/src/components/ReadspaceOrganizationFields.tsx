import { useState } from "react";
import { X } from "lucide-react";
import type { Folder, Tag } from "../types/bookmark";
import {
  Combobox,
  ComboboxLabel,
  ComboboxOption,
} from "./ui/combobox";
import {
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownMenu,
} from "./ui/dropdown";
import { Field, Label } from "./ui/fieldset";

export default function ReadspaceOrganizationFields({
  folders,
  foldersLoading,
  existingTags,
  selectedFolderId,
  tags,
  onFolderChange,
  onTagsChange,
  disabled = false,
}: {
  folders: Folder[];
  foldersLoading: boolean;
  existingTags: Tag[];
  selectedFolderId: string;
  tags: string[];
  onFolderChange: (folderId: string) => void;
  onTagsChange: (tags: string[]) => void;
  disabled?: boolean;
}) {
  const [tagQuery, setTagQuery] = useState("");
  const [tagInputKey, setTagInputKey] = useState(0);

  const addTag = (rawTag: string) => {
    const normalized = rawTag.replace(/#/g, "").trim().toLowerCase();
    if (!normalized || tags.includes(normalized) || tags.length >= 10) return;
    onTagsChange([...tags, normalized]);
    setTagQuery("");
    setTagInputKey((key) => key + 1);
  };

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <Label className="text-[var(--app-ink)]!">Collection</Label>
          <div data-slot="control">
            <Dropdown>
              <DropdownButton
                outline
                disabled={disabled || foldersLoading}
                className="w-full justify-between text-left"
              >
                {foldersLoading
                  ? "Loading collections..."
                  : selectedFolderId
                    ? folders.find((folder) => folder.id === selectedFolderId)
                        ?.name || "Select collection"
                    : "No collection"}
              </DropdownButton>
              <DropdownMenu
                anchor="bottom start"
                className="min-w-[var(--button-width)]"
              >
                <DropdownItem onClick={() => onFolderChange("")}>
                  No collection
                </DropdownItem>
                {folders.map((folder) => (
                  <DropdownItem
                    key={folder.id}
                    onClick={() => onFolderChange(folder.id)}
                  >
                    {folder.parent_id ? `↳ ${folder.name}` : folder.name}
                  </DropdownItem>
                ))}
              </DropdownMenu>
            </Dropdown>
          </div>
        </Field>

        <Field>
          <Label className="text-[var(--app-ink)]!">Tags</Label>
          <Combobox<string>
            key={tagInputKey}
            options={existingTags
              .map((tag) => tag.name)
              .filter((name) => !tags.includes(name.trim().toLowerCase()))}
            displayValue={(value) => value ?? ""}
            value={undefined}
            onChange={(name) => name && addTag(name)}
            onQueryChange={setTagQuery}
            onInputKeyDown={(event) => {
              if (event.key === "Enter" && tagQuery.trim()) {
                event.preventDefault();
                addTag(tagQuery);
              }
            }}
            placeholder="Add or search tag..."
            disabled={disabled || tags.length >= 10}
          >
            {(option) => (
              <ComboboxOption value={option}>
                <ComboboxLabel>#{option}</ComboboxLabel>
              </ComboboxOption>
            )}
          </Combobox>
        </Field>
      </div>

      {tags.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Article tags">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full border border-[color-mix(in_oklab,var(--app-primary)_16%,transparent)] bg-[color-mix(in_oklab,var(--app-primary)_12%,var(--app-card))] px-2.5 py-1 text-sm font-medium text-[var(--app-primary)]"
            >
              #{tag}
              <button
                type="button"
                onClick={() =>
                  onTagsChange(tags.filter((item) => item !== tag))
                }
                disabled={disabled}
                className="cursor-pointer rounded-full disabled:cursor-not-allowed disabled:opacity-50"
                aria-label={`Remove tag ${tag}`}
              >
                <X size={10} aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
