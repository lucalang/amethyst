import { Suspense, type ReactNode } from "react";
import { AdminApp } from "@/components/admin/admin-app";
import { AdminSkeleton } from "@/components/admin/admin-skeleton";
import { requireAdminPage } from "@/lib/admin";
import { SlimHiddenNotice, slimModeOn } from "@/components/layout/slim-gate";
import { loadAdminCatalog, loadAdminLooks, loadAdminSnapshot } from "@/lib/data/vault-admin";
import type { AuthContext } from "@/lib/supabase/auth";

async function AdminLoader({ ctx }: { ctx: AuthContext }) {
  const [snapshot, catalog, looks] = await Promise.all([loadAdminSnapshot(ctx), loadAdminCatalog(ctx), loadAdminLooks(ctx)]);
  return <AdminApp initial={{ snapshot, catalog, looks }} />;
}

/**
 * One persistent client app (and one 3D scene) for every /admin URL; pages only exist so the URLs resolve.
 * Non-admins get a 404 before anything streams.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const ctx = await requireAdminPage();
  // Admins with Slim Amethyst on see where Code Admin went instead of loading it.
  if (await slimModeOn(ctx)) return <SlimHiddenNotice area="Code Admin" />;
  return (
    <div>
      <Suspense fallback={<AdminSkeleton />}>
        <AdminLoader ctx={ctx} />
      </Suspense>
      {children}
    </div>
  );
}
