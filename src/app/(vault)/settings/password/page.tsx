import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/layout/app-shell";
import { PasswordForm } from "../forms";

export const metadata: Metadata = { title: "Password" };

export default function PasswordPage() {
  return (
    <PageContainer className="max-w-2xl">
      <PageHeader title="Set password" description="Choose a new password for email sign-in." />
      <PasswordForm />
    </PageContainer>
  );
}
