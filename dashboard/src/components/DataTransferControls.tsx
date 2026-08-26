import clsx from "clsx";
import { LoaderCircle, Upload } from "lucide-react";
import type {
  ChangeEventHandler,
  ReactNode,
  RefObject,
} from "react";
import { Button } from "./ui/button";
import { Text } from "./ui/text";

export function DataTransferSectionHeader({
  id,
  title,
  description,
}: {
  id: string;
  title: string;
  description: ReactNode;
}) {
  return (
    <div>
      <h3 id={id} className="text-base font-semibold text-gray-900">
        {title}
      </h3>
      <Text className="mt-1 text-sm text-gray-600">{description}</Text>
    </div>
  );
}

export function DataTransferActionBar({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={clsx(
        "mt-6 flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function DataTransferFileControl({
  id,
  descriptionId,
  inputRef,
  accept,
  fileName,
  emptyLabel,
  buttonLabel = "Choose file",
  busyLabel = "Reading file...",
  disabled = false,
  busy = false,
  onChange,
}: {
  id: string;
  descriptionId?: string;
  inputRef: RefObject<HTMLInputElement | null>;
  accept: string;
  fileName: string | null;
  emptyLabel: string;
  buttonLabel?: string;
  busyLabel?: string;
  disabled?: boolean;
  busy?: boolean;
  onChange: ChangeEventHandler<HTMLInputElement>;
}) {
  return (
    <>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        aria-describedby={descriptionId}
        className="hidden"
        disabled={disabled}
        onChange={onChange}
      />
      <div
        data-slot="control"
        className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"
      >
        <div
          className={clsx(
            "flex min-h-11 min-w-0 items-center rounded-lg border border-zinc-950/15 bg-white px-3.5 py-2.5 text-base/6 shadow-sm sm:min-h-9 sm:px-3 sm:py-1.5 sm:text-sm/6",
            disabled ? "opacity-50" : "text-zinc-950",
          )}
          aria-live="polite"
        >
          <span
            className={clsx(
              "truncate",
              fileName ? "text-zinc-950" : "text-zinc-500",
            )}
            title={fileName ?? undefined}
          >
            {fileName ?? emptyLabel}
          </span>
        </div>
        <Button
          type="button"
          outline
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? (
            <LoaderCircle className="animate-spin" aria-hidden="true" />
          ) : (
            <Upload aria-hidden="true" />
          )}
          {busy ? busyLabel : buttonLabel}
        </Button>
      </div>
    </>
  );
}
