import { Skeleton } from "./ui/skeleton";

export function FolderItemSkeleton() {
  return (
    <div className="px-2 py-1.5 space-y-2">
      <Skeleton className="h-10 w-full rounded-[1.05rem]" />
    </div>
  );
}

export function FolderSidebarSkeleton() {
  return (
    <div className="space-y-2">
      {/* Skeleton for Home */}
      <FolderItemSkeleton />
      {/* Skeleton for Favorites */}
      <FolderItemSkeleton />
      {/* Divider */}
      <div className="h-px bg-[#1d2230]/10  my-4" />
      {/* Folder items skeleton */}
      {Array.from({ length: 6 }).map((_, i) => (
        <FolderItemSkeleton key={i} />
      ))}
    </div>
  );
}
