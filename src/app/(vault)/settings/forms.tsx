"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updatePassword, updateProfile, type FormState } from "./actions";

const initial: FormState = { status: "idle" };

function StatusLine({ state }: { state: FormState }) {
  return (
    <p role="status" aria-live="polite" className="min-h-5 text-sm">
      {state.status === "error" ? <span className="text-destructive">{state.message}</span> : null}
      {state.status === "success" ? <span className="text-amethyst">{state.message}</span> : null}
    </p>
  );
}

export function ProfileForm({ displayName }: { displayName: string }) {
  const [state, action, pending] = useActionState(updateProfile, initial);
  return (
    <form action={action} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="displayName">Display name</Label>
        <Input id="displayName" name="displayName" defaultValue={displayName} maxLength={80} required className="max-w-sm" />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 aria-hidden className="animate-spin" /> : null}
        Save profile
      </Button>
      <StatusLine state={state} />
    </form>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, initial);
  return (
    <form action={action} className="max-w-sm space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="password">New password</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
        <p className="text-xs text-muted-foreground">At least 10 characters with a letter and a digit.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm">Confirm password</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 aria-hidden className="animate-spin" /> : null}
        Update password
      </Button>
      <StatusLine state={state} />
    </form>
  );
}
