"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { STARTUP_PATH } from "@/lib/startup";
import { completePasswordReset, type AuthState } from "../../actions";
import { ForgotPasswordForm } from "../../forgot-password/forgot-password-form";
import { FormStatus } from "../../form-status";

const initial: AuthState = { status: "idle" };
const CONTINUE_AFTER_MS = 4000;

/** Same rules as the server (newPasswordSchema), checked as you type so mistakes show before submitting. */
function passwordProblem(value: string) {
  if (value.length < 10) return "Use at least 10 characters.";
  if (value.length > 128) return "Use at most 128 characters.";
  if (!/[A-Za-z]/.test(value)) return "Include at least one letter.";
  if (!/\d/.test(value)) return "Include at least one digit.";
  return null;
}

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(completePasswordReset, initial);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState({ password: false, confirm: false });
  const router = useRouter();
  const done = state.status === "success";

  // After a successful change, continue to the app on our own (the button does it at once).
  useEffect(() => {
    if (!done) return;
    const timer = window.setTimeout(() => router.replace(STARTUP_PATH), CONTINUE_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [done, router]);

  if (done) {
    return (
      <div role="status" className="space-y-4">
        <p className="flex items-start gap-2 text-sm">
          <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-amethyst" />
          <span>
            <span className="font-semibold text-foreground">Password changed.</span> You’re signed in. Use your new password next time you sign in.
          </span>
        </p>
        <Button asChild className="h-10 w-full" autoFocus>
          <Link href={STARTUP_PATH} replace>
            Continue to Amethyst
            <ArrowRight aria-hidden />
          </Link>
        </Button>
        <p className="text-xs text-muted-foreground">Continuing automatically in a few seconds…</p>
      </div>
    );
  }

  if (state.fieldErrors?.link) {
    return (
      <div className="space-y-4">
        <FormStatus state={state} />
        <ForgotPasswordForm />
      </div>
    );
  }

  const passwordError = (touched.password && password ? passwordProblem(password) : null) ?? (state.fieldErrors?.password && state.message ? state.message : null);
  const confirmError = (touched.confirm && confirm && confirm !== password ? "Passwords do not match." : null) ?? (state.fieldErrors?.confirm ?? null);

  return (
    <form action={action} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          autoFocus
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          onBlur={() => setTouched((current) => ({ ...current, password: true }))}
          aria-invalid={passwordError ? true : undefined}
          aria-describedby="password-hint"
          className="h-10"
        />
        <p id="password-hint" className={passwordError ? "text-xs text-rose" : "text-xs text-muted-foreground"}>
          {passwordError ?? "At least 10 characters, a letter and a digit."}
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm">Confirm new password</Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          onBlur={() => setTouched((current) => ({ ...current, confirm: true }))}
          aria-invalid={confirmError ? true : undefined}
          aria-describedby={confirmError ? "confirm-error" : undefined}
          className="h-10"
        />
        {confirmError ? <p id="confirm-error" className="text-xs text-rose">{confirmError}</p> : null}
      </div>
      <Button type="submit" className="h-10 w-full" disabled={pending}>
        {pending ? <Loader2 aria-hidden className="animate-spin" /> : <Lock aria-hidden />}
        {pending ? "Saving…" : "Set new password"}
      </Button>
      <FormStatus state={state} />
    </form>
  );
}
