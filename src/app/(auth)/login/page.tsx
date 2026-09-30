import type { Metadata } from "next";
import Link from "next/link";
import { safeNextPath } from "@/lib/validation/redirect";
import { AuthShell } from "../auth-shell";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const NOTICES: Record<string, { tone: "error" | "info"; text: string }> = {
  link: { tone: "error", text: "That link is invalid or has expired. Request a new one." },
  session: { tone: "error", text: "Your session is no longer valid. Sign in again." },
  "signed-out": { tone: "info", text: "You have been signed out." },
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? safeNextPath(params.next) : undefined;
  const key = typeof params.error === "string" ? params.error : typeof params.notice === "string" ? params.notice : "";

  return (
    <AuthShell
      title="Welcome back"
      description="Sign in to your private anime and game workspaces."
      footer={
        <>
          New to Amethyst Archives?{" "}
          <Link href="/register" className="font-medium text-amethyst underline-offset-4 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <LoginForm next={next} notice={NOTICES[key]} />
    </AuthShell>
  );
}
