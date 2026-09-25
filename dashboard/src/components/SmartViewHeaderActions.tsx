import { useState } from "react";
import { Ellipsis, Pencil, Trash2 } from "lucide-react";
import { useSavedSmartViews } from "../hooks/useSavedSmartViews";
import type { SavedSmartView } from "../lib/savedSmartViews";
import {
  Dropdown,
  DropdownButton,
  DropdownDivider,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from "./ui/dropdown";
import ConfirmDialog from "./ConfirmDialog";
import SaveSmartViewDialog from "./SaveSmartViewDialog";

export default function SmartViewHeaderActions({ view, canEdit, onDeleted }: {
  view: SavedSmartView;
  canEdit: boolean;
  onDeleted: () => void;
}) {
  const { remove, removing } = useSavedSmartViews();
  const [editing, setEditing] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const handleRemove = async () => {
    setRemoveError(null);
    try {
      await remove(view.id);
      setConfirmingRemove(false);
      onDeleted();
    } catch (error) {
      setRemoveError(error instanceof Error ? error.message : "Could not remove Smart View.");
    }
  };

  return <>
    <Dropdown>
      <DropdownButton plain
        className="theme-button-icon size-9! shrink-0 items-center justify-center p-0!"
        aria-label="Smart View actions" title="Smart View actions">
        <Ellipsis className="size-5" aria-hidden="true" />
      </DropdownButton>
      <DropdownMenu anchor="bottom start" className="min-w-52">
        <DropdownItem disabled={!canEdit} onClick={() => setEditing(true)}>
          <Pencil data-slot="icon" aria-hidden="true" />
          <DropdownLabel>Edit view</DropdownLabel>
        </DropdownItem>
        <DropdownDivider />
        <DropdownItem onClick={() => { setRemoveError(null); setConfirmingRemove(true); }}>
          <Trash2 data-slot="icon" aria-hidden="true" />
          <DropdownLabel>Remove view</DropdownLabel>
        </DropdownItem>
      </DropdownMenu>
    </Dropdown>

    <SaveSmartViewDialog open={editing} onClose={() => setEditing(false)}
      query={view.query} filters={view.filters} view={view} />
    <ConfirmDialog open={confirmingRemove} onClose={() => setConfirmingRemove(false)}
      title="Remove Saved Smart View?"
      description={`Remove “${view.name}” from your sidebar? Your library items will stay where they are.`}
      confirmLabel="Remove view" busyLabel="Removing…" busy={removing}
      error={removeError} onConfirm={() => void handleRemove()} />
  </>;
}
