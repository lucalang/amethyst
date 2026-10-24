"use client";

import { useActionState, useState } from "react";
import { Loader2, X } from "lucide-react";
import { ProfileAvatar } from "@/components/layout/profile-avatar";
import { ImageUrlField } from "@/components/media/image-url-field";
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

export function ProfileForm({ displayName, motto, avatarUrl }: { displayName: string; motto: string; avatarUrl: string }) {
  const [state, action, pending] = useActionState(updateProfile, initial);
  const [name, setName] = useState(displayName);
  const [line, setLine] = useState(motto);
  const [avatar, setAvatar] = useState(avatarUrl);
  // Remounts the image field so "Remove picture" clears links and uploads alike.
  const [fieldKey, setFieldKey] = useState(0);
  const [fieldDefault, setFieldDefault] = useState(avatarUrl);
  return (
    <form action={action} className="space-y-5">
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-white/[0.07] bg-white/[0.02] p-4">
        <ProfileAvatar name={name} src={avatar} className="size-16 text-xl" />
        <div className="min-w-0">
          <p className="truncate text-base font-semibold">{name.trim() || "Your account"}</p>
          <p className="line-clamp-2 text-sm break-words text-muted-foreground">{line.trim() || "No motto yet"}</p>
          <p className="mt-1 text-[11px] text-muted-foreground/75">Preview · only you can see your profile</p>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="displayName">Display name</Label>
        <Input
          id="displayName"
          name="displayName"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
          autoComplete="nickname"
          placeholder="What should Home call you?"
          className="max-w-sm"
        />
        <p className="text-xs text-muted-foreground">Used in Home’s welcome and your achievement cabinet. Leave it empty to stay unnamed.</p>
      </div>
      <div className="space-y-1.5">
        <ImageUrlField
          key={fieldKey}
          id="avatarUrl"
          name="avatarUrl"
          label="Picture"
          hint="Upload a square image, or paste a link. Without one, your initials are shown."
          defaultValue={fieldDefault}
          shape="square"
          onValueChange={setAvatar}
        />
        {avatar ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-rose"
            onClick={() => {
              setAvatar("");
              setFieldDefault("");
              setFieldKey((key) => key + 1);
            }}
          >
            <X aria-hidden /> Remove picture
          </Button>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="motto">Motto</Label>
        <Input
          id="motto"
          name="motto"
          value={line}
          onChange={(event) => setLine(event.target.value)}
          maxLength={160}
          placeholder="A short line about you (optional)"
          className="max-w-xl"
        />
        <p className="text-xs text-muted-foreground tabular-nums">{line.length}/160 · shown beneath your welcome on Home.</p>
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
