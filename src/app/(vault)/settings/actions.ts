"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/auth";

export type FormState = { status: "idle" | "success" | "error"; message?: string };

const profileSchema = z.object({ displayName: z.string().trim().min(1, "Enter a name.").max(80) });

export async function updateProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireUser();
  const parsed = profileSchema.safeParse({ displayName: formData.get("displayName") });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid name." };

  const { error } = await ctx.supabase
    .from("users")
    .update({ display_name: parsed.data.displayName })
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
