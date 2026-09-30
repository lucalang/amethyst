"use client";

import { useActionState } from "react";
import { Loader2, Mail, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resendConfirmation, signUp, type AuthState } from "../actions";
import { FormStatus } from "../form-status";

const initial: AuthState = { status: "idle" };

export function RegisterForm() {
  const [state, action, pending] = useActionState(signUp, initial);
  const [resendState, resendAction, resendPending] = useActionState(resendConfirmation, initial);
  const errors = state.fieldErrors ?? {};

  if (state.status === "success") {
    return (
      <div className="space-y-5">
        <div role="status" className="rounded-lg border border-amethyst/30 bg-amethyst/10 p-4">
          <p className="flex items-center gap-2 font-semibold">
            <MailCheck aria-hidden className="size-5 text-amethyst" /> Check your inbox
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">{state.message}</p>
        </div>
        <form action={resendAction} className="space-y-2">
          <input type="hidden" name="email" value={state.email ?? ""} />
          <Button type="submit" variant="outline" className="w-full" disabled={resendPending}>
            {resendPending ? <Loader2 aria-hidden className="animate-spin" /> : <Mail aria-hidden />}
            Resend the email
          </Button>
          <FormStatus state={resendState} />
        </form>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={state.email}
          required
          className="h-10"
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? "email-error" : undefined}
        />
        {errors.email ? (
          <p id="email-error" className="text-xs text-rose">
            {errors.email}
          </p>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          className="h-10"
          aria-invalid={Boolean(errors.password)}
          aria-describedby="password-hint"
        />
        <p id="password-hint" className={errors.password ? "text-xs text-rose" : "text-xs text-muted-foreground"}>
          {errors.password ?? "At least 10 characters, with letters and digits."}
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm">Confirm password</Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          className="h-10"
          aria-invalid={Boolean(errors.confirm)}
          aria-describedby={errors.confirm ? "confirm-error" : undefined}
        />
        {errors.confirm ? (
          <p id="confirm-error" className="text-xs text-rose">
            {errors.confirm}
          </p>
        ) : null}
      </div>
      <Button type="submit" className="h-10 w-full" disabled={pending}>
        {pending ? <Loader2 aria-hidden className="animate-spin" /> : null}
        {pending ? "Creating account…" : "Create account"}
      </Button>
      <FormStatus state={state} />
    </form>
  );
}
