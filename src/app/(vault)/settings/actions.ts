"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/auth";
import { artworkUrl } from "@/lib/validation/entries";

export type FormState = { status: "idle" | "success" | "error"; message?: string };

const hasControls = (value: string) => [...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);

const profileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .max(80, "Names can be at most 80 characters.")
    .refine((value) => !hasControls(value), "Names cannot contain control characters.")
    .transform((value) => value || null),
  motto: z
    .string()
    .transform((value) => value.replace(/\s+/g, " ").trim())
    .pipe(z.string().max(160, "Keep your motto to 160 characters.").refine((value) => !hasControls(value), "Mottos cannot contain control characters."))
    .transform((value) => value || null),
  avatarUrl: artworkUrl.transform((value) => value || null),
});

/** Private profile details (name, avatar, motto). Sign-in email and password are handled separately. */
export async function updateProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireUser();
  const parsed = profileSchema.safeParse({
    displayName: formData.get("displayName") ?? "",
    motto: formData.get("motto") ?? "",
    avatarUrl: formData.get("avatarUrl") ?? "",
  });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Check your profile details." };

  const { error } = await ctx.supabase
    .from("users")
    .update({ display_name: parsed.data.displayName, motto: parsed.data.motto, avatar_url: parsed.data.avatarUrl })
    .eq("id", ctx.userId);
  if (error) return { status: "error", message: "Could not save your profile." };
  revalidatePath("/", "layout");
  return { status: "success", message: "Profile saved." };
}

const passwordSchema = z
  .object({
    password: z
      .string()
      .min(10, "Use at least 10 characters.")
      .max(128)
      .regex(/[A-Za-z]/, "Include a letter.")
      .regex(/\d/, "Include a digit."),
    confirm: z.string(),
  })
  .refine((value) => value.password === value.confirm, { message: "Passwords do not match.", path: ["confirm"] });

export async function updatePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireUser();
  const parsed = passwordSchema.safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid password." };

  const { error } = await ctx.supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { status: "error", message: error.message.includes("different") ? error.message : "Could not update password." };
  return { status: "success", message: "Password updated." };
}
