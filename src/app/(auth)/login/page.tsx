import type { Metadata } from "next";
import { safeNextPath } from "@/lib/validation/redirect";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? safeNextPath(params.next) : undefined;

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2">
          <span aria-hidden className="grid size-8 place-items-center rounded-md bg-jade font-bold text-jade-foreground">
            A
          </span>
          <span className="text-lg font-semibold tracking-tight">Archive</span>
        </div>
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="mt-1 mb-6 text-sm text-muted-foreground">This archive is private and invite-only.</p>
        <LoginForm next={next} linkError={params.error === "link"} sessionError={params.error === "session"} />
      </div>
    </main>
  );
}
