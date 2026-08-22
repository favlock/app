import { cn } from "../../lib/utils";

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("liquid-skeleton rounded-xl", className)} {...props} />
  );
}

export { Skeleton };
