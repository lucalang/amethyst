import { PageContainer } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <PageContainer>
      <div role="status" aria-label="Loading inventory" className="space-y-5">
        <div className="space-y-2">
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))]">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-[3.9rem] rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-9 w-72 max-w-full" />
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(19rem,23rem)_minmax(0,1fr)]">
          <Skeleton className="h-[26rem] rounded-2xl" />
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => (
              <li key={index}>
                <Skeleton className="h-[13rem] w-full rounded-2xl" />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </PageContainer>
  );
}
