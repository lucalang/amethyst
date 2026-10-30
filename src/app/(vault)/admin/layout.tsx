import type { ReactNode } from "react";
import { AdminConsole } from "@/components/admin/admin-console";
import { requireAdminPage } from "@/lib/admin";

/** The console persists across admin pages, so its scene and activation run once. Non-admins get a 404. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdminPage();
  return <AdminConsole>{children}</AdminConsole>;
}
