import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { CodeBuilder } from "@/components/admin/code-builder";
import { requireAdminPage } from "@/lib/admin";
import { loadAdminAccounts, loadAdminCatalog, loadAdminCode, loadAdminLooks, loadAdminOverview } from "@/lib/data/vault-admin";
import { configFrom, EMPTY_CONFIG, LIMITS, type AdminAccount, type CodeConfig } from "@/lib/vault-admin";

export const metadata: Metadata = { title: "New Vault code · Admin" };

const uuid = z.uuid();

export default async function NewCodePage({ searchParams }: { searchParams: Promise<{ draft?: string; clone?: string }> }) {
  const ctx = await requireAdminPage();
  const { draft, clone } = await searchParams;
  const [catalog, looks] = await Promise.all([loadAdminCatalog(ctx), loadAdminLooks(ctx)]);

  let initial: CodeConfig = { ...EMPTY_CONFIG };
  let accounts: AdminAccount[] = [];
  let draftId: string | null = null;
  let cloneOf: string | null = null;

  if (draft) {
    if (!uuid.safeParse(draft).success) notFound();
    const saved = (await loadAdminOverview(ctx)).drafts.find((entry) => entry.id === draft);
    if (!saved) notFound();
    initial = configFrom(saved.config);
    accounts = await loadAdminAccounts(ctx, initial.allowlist);
    // Accounts deleted since the draft was saved drop out of the allowlist.
    initial.allowlist = initial.allowlist.filter((id) => accounts.some((account) => account.id === id));
    draftId = saved.id;
  } else if (clone) {
    if (!uuid.safeParse(clone).success) notFound();
    const { code, now } = await loadAdminCode(ctx, clone);
    if (!code) notFound();
    const future = (iso: string | null) => (iso && Date.parse(iso) > now ? iso : null);
    initial = {
      label: `${code.label} (copy)`.slice(0, LIMITS.label),
      coins: code.coins,
      items: code.items,
      achievements: code.achievements,
      audience: code.audience,
      allowlist: code.allowlist.map((account) => account.id),
      startsAt: future(code.startsAt),
      expiresAt: future(code.expiresAt),
      maxRedemptions: code.maxRedemptions,
      perAccountLimit: code.perAccountLimit,
      codeMode: code.format === "phrase" ? "phrase" : "random",
    };
    accounts = code.allowlist;
    cloneOf = code.id;
  }

  return <CodeBuilder key={draftId ?? cloneOf ?? "new"} catalog={catalog} looks={looks} initial={initial} accounts={accounts} draftId={draftId} cloneOf={cloneOf} />;
}
