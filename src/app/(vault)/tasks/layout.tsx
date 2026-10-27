import { Suspense, type ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { TasksApp } from "@/components/tasks/tasks-app";
import { loadTaskSnapshot } from "@/lib/data/tasks";
import { requireUser } from "@/lib/supabase/auth";

async function TasksLoader() {
  const ctx = await requireUser();
  const initial = await loadTaskSnapshot(ctx);
  return <TasksApp userId={ctx.userId} initial={initial} />;
}

function TasksSkeleton() {
  return (
    <div aria-busy aria-label="Loading tasks" className="-mb-24 flex h-[calc(100dvh-3.5rem-1px)] md:-mb-10">
      <div className="hidden w-72 shrink-0 space-y-2 border-r border-white/[0.06] p-3 md:block">
        {Array.from({ length: 7 }, (_, index) => (
          <Skeleton key={index} className="h-9 rounded-md" />
        ))}
      </div>
      <div className="flex-1 space-y-3 px-4 pt-6 sm:px-8">
        <Skeleton className="h-9 w-full max-w-md rounded-full" />
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-12 rounded-lg" />
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-[3.25rem] rounded-lg" />
        ))}
      </div>
    </div>
  );
}

/** One persistent client app for every /tasks URL; pages only exist so the URLs resolve. */
export default function TasksLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Suspense fallback={<TasksSkeleton />}>
        <TasksLoader />
      </Suspense>
      {children}
    </>
  );
}
