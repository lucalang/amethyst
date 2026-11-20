import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ForgotPasswordForm } from "../../forgot-password/forgot-password-form";
import { AuthShell } from "../../auth-shell";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Set new password" };

const linkClass = "font-medium text-amethyst underline-offset-4 hover:underline";

/**
 * Step two of a password reset. /auth/confirm verifies the emailed link and signs this browser in with a recovery
 * session before redirecting here; without that session (or with `?error=link`) the link was invalid or expired.
 */
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub) && data?.claims?.is_anonymous !== true;

  if (params.error !== undefined || !signedIn) {
    return (
      <AuthShell
        title="This reset link doesn’t work"
        description="It may have expired, already been used, or been opened in a different browser from the one you requested it in. Request a new link and open it on this device."
        footer={
          <Link href="/login" className={linkClass}>
            Back to sign in
          </Link>
        }
      >
        <ForgotPasswordForm />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Choose a new password"
      description="Pick a strong password you haven't used before. At least 10 characters, a letter and a digit."
      footer={
        <Link href="/" className={linkClass}>
          Keep my current password
        </Link>
      }
    >
      <ResetPasswordForm />
    </AuthShell>
  );
}
