"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, LayoutTemplate, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MemberProfile, MemberShowcase, ShowcaseEditorData } from "@/lib/data/profiles";
import { cn } from "@/lib/utils";
import { ShowcaseEditor } from "./showcase-editor";
import { ShowcaseStage, type ShowcaseIdentity } from "./showcase-stage";

/** A member's profile showcase. `avatar` is the owner's stored avatar or another member's avatar route; `editor` is owner-only. */
export function MemberProfileView({
  profile,
  own,
  avatar,
  showcase,
  editor,
}: {
  profile: MemberProfile;
  own: boolean;
  avatar: { src?: string | null; imageSrc?: string | null };
  showcase: MemberShowcase;
  editor?: ShowcaseEditorData;
}) {
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const identity: ShowcaseIdentity = {
    name: profile.name ?? (own ? "Your profile" : "Amethyst member"),
    hasName: Boolean(profile.name),
    title: profile.title,
    motto: profile.motto,
    badges: profile.badges,
    decoration: profile.decoration,
    memberSince: profile.memberSince,
    avatar,
  };

  return (
    <div className={cn("mx-auto w-full px-4 py-6 md:px-6 md:py-10", editing ? "max-w-6xl" : "max-w-5xl")}>
      {own && editor && editing ? (
        <ShowcaseEditor
          memberId={profile.id}
          identity={identity}
          initial={showcase}
          data={editor}
          onClose={(done) => {
            setEditing(false);
            setSaved(Boolean(done));
          }}
        />
      ) : (
        <>
          <ShowcaseStage
            memberId={profile.id}
            arrangement={showcase}
            identity={identity}
            pieces={showcase.pieces}
            own={own}
            actions={
              own ? (
                <>
                  {editor ? (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        setSaved(false);
                        setEditing(true);
                      }}
                    >
                      <LayoutTemplate aria-hidden /> Arrange showcase
                    </Button>
                  ) : null}
                  <Button asChild variant="outline" size="sm">
                    <Link href="/customization/profile">
                      <PenLine aria-hidden /> Edit profile
                    </Link>
                  </Button>
                </>
              ) : null
            }
          />
          {own ? (
            <p role="status" aria-live="polite" className="mt-4 flex items-start gap-2 px-1 text-xs leading-5 text-muted-foreground">
              <Eye aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              {saved ? <span className="text-amethyst">Showcase saved. </span> : null}
              This is how other signed-in Amethyst members see your profile. Your email, coins, notes, tasks and anything you haven’t featured are never shown.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
