"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Loader2, Mail } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resendConfirmation, sendMagicLink, signInWithPassword, type AuthState } from "../actions";
import { FormStatus } from "../form-status";

const initial: AuthState = { status: "idle" };

export function LoginForm({ next, notice }: { next?: string; notice?: { tone: "error" | "info"; text: string } }) {
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [passwordState, passwordAction, passwordPending] = useActionState(signInWithPassword, initial);
  const [magicState, magicAction, magicPending] = useActionState(sendMagicLink, initial);
  const [resendState, resendAction, resendPending] = useActionState(resendConfirmation, initial);
  const state = mode === "password" ? passwordState : magicState;

  return (
    <div className="space-y-5">
      {notice ? (
        <Alert variant={notice.tone === "error" ? "destructive" : "default"}>
          <AlertDescription>{notice.text}</AlertDescription>
        </Alert>
      ) : null}

      {mode === "password" ? (
        <form action={passwordAction} className="space-y-4" noValidate>
          <input type="hidden" name="next" value={next ?? ""} />
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" defaultValue={passwordState.email} required className="h-10" />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="password">Password</Label>
              <Link href="/forgot-password" className="text-xs text-muted-foreground underline-offset-4 hover:text-amethyst hover:underline">
                Forgot password?
              </Link>
            </div>
            <Input id="password" name="password" type="password" autoComplete="current-password" required className="h-10" />
          </div>
          <Button type="submit" className="h-10 w-full" disabled={passwordPending}>
            {passwordPending ? <Loader2 aria-hidden className="animate-spin" /> : null}
            {passwordPending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      ) : (
        <form action={magicAction} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="magic-email">Email</Label>
            <Input id="magic-email" name="email" type="email" autoComplete="email" required className="h-10" />
          </div>
          <Button type="submit" className="h-10 w-full" disabled={magicPending}>
            {magicPending ? <Loader2 aria-hidden className="animate-spin" /> : <Mail aria-hidden />}
            Email me a sign-in link
          </Button>
        </form>
      )}

      <FormStatus state={state} />

      {mode === "password" && passwordState.status === "unconfirmed" ? (
        <form action={resendAction} className="space-y-2">
          <input type="hidden" name="email" value={passwordState.email ?? ""} />
          <Button type="submit" variant="outline" className="w-full" disabled={resendPending}>
            {resendPending ? <Loader2 aria-hidden className="animate-spin" /> : <Mail aria-hidden />}
            Resend confirmation email
          </Button>
          <FormStatus state={resendState} />
        </form>
      ) : null}

      <button
        type="button"
        onClick={() => setMode(mode === "password" ? "magic" : "password")}
        className="w-full rounded-md py-2 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        {mode === "password" ? "Use a magic link instead" : "Use your password instead"}
      </button>
    </div>
  );
}
