import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "../auth-shell";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Create account" };

export default function RegisterPage() {
  return (
    <AuthShell
      title="Create your account"
      description="Amethyst brings Archive, To Do and Arcade together. Everything starts empty and private: only you can see your collections, tasks and scores."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-amethyst underline-offset-4 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <RegisterForm />
    </AuthShell>
  );
}
