import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { CodeDetail } from "@/components/admin/code-detail";
import { requireAdminPage } from "@/lib/admin";
import { loadAdminCode, loadAdminLooks } from "@/lib/data/vault-admin";

export const metadata: Metadata = { title: "Vault code · Admin" };

export default async function AdminCodePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdminPage();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [{ code, now }, looks] = await Promise.all([loadAdminCode(ctx, id), loadAdminLooks(ctx)]);
  if (!code) notFound();
  return <CodeDetail code={code} now={now} looks={looks} />;
}
