import type { Metadata } from "next";
import { AdminCodes } from "@/components/admin/admin-codes";
import { requireAdminPage } from "@/lib/admin";
import { loadAdminOverview } from "@/lib/data/vault-admin";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage() {
  const ctx = await requireAdminPage();
  const { codes, drafts, now } = await loadAdminOverview(ctx);
  return <AdminCodes codes={codes} drafts={drafts} now={now} />;
}
