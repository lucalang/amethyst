import type { ReactNode } from "react";
import { SlimHiddenNotice, slimModeOn } from "@/components/layout/slim-gate";
import { requireAdminPage } from "@/lib/admin";

/**
 * Hidden while Slim Amethyst is on (see lib/slim.ts). The admin check runs first, exactly as on the page, so
 * non-admins still get a 404 whether Slim is on or not.
 */
export default async function Layout({ children }: { children: ReactNode }) {
  const ctx = await requireAdminPage();
  return (await slimModeOn(ctx)) ? <SlimHiddenNotice area="Admin Dashboard" /> : children;
}
