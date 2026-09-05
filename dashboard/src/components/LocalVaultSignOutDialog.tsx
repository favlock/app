import ConfirmDialog from "./ConfirmDialog";

export default function LocalVaultSignOutDialog({
  open,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDialog
      open={open}
      title="Erase this local vault?"
      description="Signing out will permanently erase everything stored in this local vault from this browser. This cannot be undone. Back up the vault first if you want to keep it."
      confirmLabel="Erase vault & sign out"
      busyLabel="Erasing vault..."
      busy={busy}
      error={error}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
