import { Skeleton } from "@/components/ui/skeleton";

export function StudySkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="mx-auto aspect-square w-full max-w-sm rounded-xl" />
      <div className="mx-auto flex w-full max-w-sm gap-3">
        <Skeleton className="h-16 flex-1 rounded-lg" />
        <Skeleton className="h-16 flex-1 rounded-lg" />
      </div>
    </div>
  );
}
