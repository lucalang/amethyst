import type { Metadata } from "next";
import { PasswordForm } from "../forms";
import { SettingsHeader } from "../settings-ui";

export const metadata: Metadata = { title: "Password" };

export default function PasswordPage() {
  return (
    <>
      <SettingsHeader title="Set password" description="Choose a new password for email sign-in." />
      <PasswordForm />
    </>
  );
}
