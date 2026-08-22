import { useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";
import clsx from "clsx";
import { Input } from "./ui/input";

type PasswordInputProps = Omit<ComponentProps<typeof Input>, "type"> & {
  visibilityLabel?: string;
};

export default function PasswordInput({
  className,
  visibilityLabel = "password",
  ...props
}: PasswordInputProps) {
  const [isVisible, setIsVisible] = useState(false);
  const actionLabel = `${isVisible ? "Hide" : "Show"} ${visibilityLabel}`;
  const VisibilityIcon = isVisible ? EyeOff : Eye;

  return (
    <div className="relative">
      <Input
        {...props}
        type={isVisible ? "text" : "password"}
        className={clsx(className, "[&_input]:pr-12 sm:[&_input]:pr-10")}
      />
      <button
        type="button"
        aria-label={actionLabel}
        title={actionLabel}
        aria-pressed={isVisible}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setIsVisible((visible) => !visible)}
        className="absolute top-1/2 right-1.5 z-20 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-emerald-700/8 hover:text-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-amber-500 sm:right-1 sm:size-8"
      >
        <VisibilityIcon className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
