import { Skeleton } from "./ui/skeleton";

const SKELETON_COUNT = 6;

export function BookmarkCardSkeleton() {
  return (
    <div className="liquid-skeleton-surface p-3 space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-2/3 rounded-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
        <Skeleton className="size-10 rounded-full" />
      </div>

      <div className="rounded-lg border border-[#1d2230]/10 p-1.5 space-y-1.5">
        <Skeleton className="h-4 w-20 rounded-full" />
        <Skeleton className="h-4 w-16 rounded-full" />
      </div>

      <div className="flex justify-between items-center pt-1">
        <Skeleton className="h-6 w-24 rounded-full" />
        <div className="flex gap-1.5">
          <Skeleton className="size-10 rounded-full" />
          <Skeleton className="size-10 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export function BookmarkListSkeleton() {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
        <li key={i} className="list-none">
          <BookmarkCardSkeleton />
        </li>
      ))}
    </ul>
  );
}
