import { LoaderCircle, MessageSquareText } from "lucide-react";
import { Button } from "./ui/button";
import { DialogDescription, DialogTitle } from "./ui/dialog";
import { Textarea } from "./ui/textarea";

export default function HighlightAnnotationEditor({
  value,
  saving,
  error,
  canRemove,
  onChange,
  onCancel,
  onSave,
  onRemove,
}: {
  value: string;
  saving: boolean;
  error: string | null;
  canRemove: boolean;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-xl border border-[color-mix(in_oklab,var(--app-line)_10%,transparent)] bg-[color-mix(in_oklab,var(--app-card-strong)_58%,var(--app-highlight))] p-3">
      <div className="mb-2.5 flex items-start gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_oklab,var(--app-primary)_10%,var(--app-card))] text-[var(--app-primary)]">
          <MessageSquareText className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <DialogTitle className="text-sm/5!">Private annotation</DialogTitle>
          <DialogDescription className="mt-0! text-xs/5!">
            Encrypted before it leaves this browser.
          </DialogDescription>
        </div>
      </div>
      <Textarea
        autoFocus
        rows={3}
        maxLength={10_000}
        resizable={false}
        value={value}
        placeholder="Add a note about this passage…"
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? <p className="mt-2 text-xs text-red-600 dark:text-red-300" role="alert">{error}</p> : null}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-xs tabular-nums text-[var(--app-muted)]">
            {value.length.toLocaleString()} / 10,000
          </span>
          {canRemove ? (
            <Button
              type="button"
              plain
              className="text-red-600! dark:text-red-300! data-hover:text-red-700! data-hover:dark:text-red-300!"
              disabled={saving}
              onClick={onRemove}
            >
              Remove annotation
            </Button>
          ) : null}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Button type="button" plain disabled={saving} onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" disabled={saving || !value.trim()} onClick={onSave}>
            {saving ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
