import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div role="status" aria-label="Loading">
      <div className="h-32 md:h-48" />
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <div className="-mt-16 flex items-end gap-5 pb-6 md:-mt-24">
          <Skeleton className="aspect-[2/3] w-24 md:w-32" />
          <div className="flex-1 space-y-2 pb-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-8 w-64 max-w-full" />
          </div>
        </div>
      </div>
      <div className="mx-auto grid min-h-[calc(100dvh-3.5rem)] max-w-7xl grid-cols-1 border-y border-border md:grid-cols-[15rem_minmax(0,1fr)] md:rounded-lg md:border lg:grid-cols-[18rem_minmax(0,1fr)]">
        <div className="hidden space-y-2 border-r border-border p-3 md:block">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-5" style={{ width: `${80 - index * 7}%` }} />
          ))}
        </div>
        <div className="space-y-3 p-6">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-full max-w-2xl" />
          <Skeleton className="h-4 w-5/6 max-w-xl" />
        </div>
      </div>
    </div>
  );
}
