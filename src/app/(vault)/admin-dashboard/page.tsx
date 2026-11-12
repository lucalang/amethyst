import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { requireAdminPage } from "@/lib/admin";
import { loadAdminDashboard } from "@/lib/data/admin-dashboard";
import type { AuthContext } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Admin Dashboard" };

async function DashboardLoader({ ctx }: { ctx: AuthContext }) {
  const state = await loadAdminDashboard(ctx);
  if (!state) {
    return (
      <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
        The Admin Dashboard couldn’t be loaded. Reload the page to try again.
      </p>
    );
  }
  return <AdminDashboard initial={state} />;
}

function DashboardSkeleton() {
  return (
    <div aria-busy aria-label="Loading the Admin Dashboard" className="grid gap-4">
      <div className="h-40 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-72 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
        <div className="h-72 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
      </div>
    </div>
  );
}

/** Non-admins get a 404 before anything streams, like /admin. Every action is checked again by its API route and database function. */
export default async function AdminDashboardPage() {
  const ctx = await requireAdminPage();
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-7 md:px-6 md:py-10">
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardLoader ctx={ctx} />
      </Suspense>
    </div>
  );
}
