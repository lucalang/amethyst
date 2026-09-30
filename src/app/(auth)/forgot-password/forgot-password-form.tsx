"use client";

import { useActionState } from "react";
import { Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset, type AuthState } from "../actions";
import { FormStatus } from "../form-status";

const initial: AuthState = { status: "idle" };

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, initial);
  return (
    <form action={action} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" defaultValue={state.email} required className="h-10" />
      </div>
      <Button type="submit" className="h-10 w-full" disabled={pending}>
        {pending ? <Loader2 aria-hidden className="animate-spin" /> : <Mail aria-hidden />}
        Send reset link
      </Button>
      <FormStatus state={state} />
    </form>
  );
}
