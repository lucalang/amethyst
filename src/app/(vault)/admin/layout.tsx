import { Suspense, type ReactNode } from "react";
import { AdminApp } from "@/components/admin/admin-app";
import { sanctumFont } from "@/components/admin/admin-font";
import { requireAdminPage } from "@/lib/admin";
import { loadAdminCatalog, loadAdminLooks, loadAdminSnapshot } from "@/lib/data/vault-admin";
import type { AuthContext } from "@/lib/supabase/auth";

async function AdminLoader({ ctx }: { ctx: AuthContext }) {
  const [snapshot, catalog, looks] = await Promise.all([loadAdminSnapshot(ctx), loadAdminCatalog(ctx), loadAdminLooks(ctx)]);
  return <AdminApp initial={{ snapshot, catalog, looks }} />;
}

function AdminSkeleton() {
  return (
    <div aria-busy aria-label="Opening the admin panel" className="-mb-24 grid h-[calc(100dvh-3.5rem-1px)] place-items-center bg-[#030203] md:-mb-10">
      <span className="size-16 animate-pulse rounded-full border border-[#ff1f3d]/40 shadow-[0_0_40px_#ff1f3d55]" />
    </div>
  );
}

/**
 * One persistent client app (and one 3D scene) for every /admin URL; pages only exist so the URLs resolve.
 * Non-admins get a 404 before anything streams.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const ctx = await requireAdminPage();
  return (
    <div className={sanctumFont.variable}>
      <Suspense fallback={<AdminSkeleton />}>
        <AdminLoader ctx={ctx} />
      </Suspense>
      {children}
    </div>
  );
}
