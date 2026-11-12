"use client";

import { useActionState } from "react";
import { Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { completePasswordReset, type AuthState } from "../../actions";
import { FormStatus } from "../../form-status";

const initial: AuthState = { status: "idle" };

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(completePasswordReset, initial);

  return (
    <form action={action} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="password">New password</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" required className="h-10" />
        <p className="text-xs text-muted-foreground">At least 10 characters, a letter and a digit.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm">Confirm password</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required className="h-10" />
      </div>
      <Button type="submit" className="h-10 w-full" disabled={pending}>
        {pending ? <Loader2 aria-hidden className="animate-spin" /> : <Lock aria-hidden />}
        Set new password
      </Button>
      <FormStatus state={state} />
    </form>
  );
}
