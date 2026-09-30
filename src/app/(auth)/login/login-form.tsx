"use client";

import { useActionState, useState } from "react";
import { Loader2, Mail } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendMagicLink, signInWithPassword, type LoginState } from "./actions";

const initial: LoginState = { status: "idle" };

export function LoginForm({ next, linkError, sessionError }: { next?: string; linkError?: boolean; sessionError?: boolean }) {
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [passwordState, passwordAction, passwordPending] = useActionState(signInWithPassword, initial);
  const [magicState, magicAction, magicPending] = useActionState(sendMagicLink, initial);
  const state = mode === "password" ? passwordState : magicState;

  return (
    <div className="space-y-5">
      {linkError ? (
        <Alert variant="destructive">
          <AlertDescription>That sign-in link is invalid or has expired. Request a new one.</AlertDescription>
        </Alert>
      ) : null}
      {sessionError ? (
        <Alert variant="destructive">
          <AlertDescription>Your session is no longer valid. Sign in again.</AlertDescription>
        </Alert>
      ) : null}

      {mode === "password" ? (
        <form action={passwordAction} className="space-y-4" noValidate>
          <input type="hidden" name="next" value={next ?? ""} />
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" defaultValue={passwordState.email} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          <Button type="submit" className="h-10 w-full" disabled={passwordPending}>
            {passwordPending ? <Loader2 aria-hidden className="animate-spin" /> : null}
            Sign in
          </Button>
        </form>
      ) : (
        <form action={magicAction} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="magic-email">Email</Label>
            <Input id="magic-email" name="email" type="email" autoComplete="email" required />
          </div>
          <Button type="submit" className="h-10 w-full" disabled={magicPending}>
            {magicPending ? <Loader2 aria-hidden className="animate-spin" /> : <Mail aria-hidden />}
            Email me a sign-in link
          </Button>
        </form>
      )}

      <p role="status" aria-live="polite" className="min-h-5 text-sm">
        {state.status === "error" ? <span className="text-destructive">{state.message}</span> : null}
        {state.status === "sent" ? <span className="text-jade">{state.message}</span> : null}
      </p>

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
