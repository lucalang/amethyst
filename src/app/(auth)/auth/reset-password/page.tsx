import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "../../auth-shell";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Set new password" };

export default function ResetPasswordPage() {
  return (
    <AuthShell
      title="Choose a new password"
      description="Pick a strong password you haven't used before. At least 10 characters, a letter and a digit."
      footer={
        <Link href="/login" className="font-medium text-amethyst underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      }
    >
      <ResetPasswordForm />
    </AuthShell>
  );
}
