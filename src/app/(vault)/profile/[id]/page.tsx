import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MemberProfileView } from "@/components/profile/member-profile";
import { loadProfile } from "@/lib/data/preferences";
import { loadMemberProfile, memberAvatarPath } from "@/lib/data/profiles";
import { getAuthContext, requireUser } from "@/lib/supabase/auth";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!ctx) return { title: "Profile" };
  const profile = await loadMemberProfile(ctx, id).catch(() => null);
  if (!profile) return { title: "Not found" };
  return { title: profile.id === ctx.userId ? "My Profile" : (profile.name ?? "Member profile") };
}

export default async function MemberProfilePage({ params }: Props) {
  const { id } = await params;
  const ctx = await requireUser();
  const profile = await loadMemberProfile(ctx, id);
  if (!profile) notFound();
  const own = profile.id === ctx.userId;
  // Owners load their avatar through their own private routes; others through the member avatar route.
  const avatar = own
    ? { src: (await loadProfile(ctx).catch(() => null))?.avatar_url ?? null }
    : { imageSrc: profile.hasAvatar ? memberAvatarPath(profile.id) : null };
  return <MemberProfileView profile={profile} own={own} avatar={avatar} />;
}
