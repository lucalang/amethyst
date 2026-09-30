import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "../auth-shell";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Reset your password"
      description="Enter your account's email address and we will send you a link to choose a new password."
      footer={
        <Link href="/login" className="font-medium text-amethyst underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
