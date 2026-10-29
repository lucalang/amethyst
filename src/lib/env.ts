import "server-only";
import { z } from "zod";

// Empty placeholders (KEY=) count as unset.
const blankAsUnset = <T extends z.ZodType>(type: T) => z.preprocess((value) => (typeof value === "string" && !value.trim() ? undefined : value), type);
const optional = blankAsUnset(z.string().trim().optional());

const R2_KEYS = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"] as const;

const schema = z
  .object({
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
    APP_URL: z.url(),
    // Private Cloudflare R2 bucket for uploaded images (all four or none).
    R2_ACCOUNT_ID: optional,
    R2_ACCESS_KEY_ID: optional,
    R2_SECRET_ACCESS_KEY: optional,
    R2_BUCKET: optional,
    // Only for jurisdiction-specific buckets, e.g. https://<account>.eu.r2.cloudflarestorage.com
    R2_ENDPOINT: blankAsUnset(z.url().optional()),
    ATTACHMENT_STORAGE: blankAsUnset(z.enum(["supabase", "r2"]).default("r2")),
  })
  .superRefine((env, ctx) => {
    const set = R2_KEYS.filter((key) => env[key]);
    if (set.length && set.length < R2_KEYS.length) {
      ctx.addIssue({ code: "custom", path: ["R2"], message: `set all of ${R2_KEYS.join(", ")} or none` });
    }
    if (env.ATTACHMENT_STORAGE === "r2" && set.length < R2_KEYS.length) {
      ctx.addIssue({ code: "custom", path: ["ATTACHMENT_STORAGE"], message: "\"r2\" needs the R2_* variables" });
    }
  });

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | undefined;

/** Validated server environment. Throws a descriptive error on misconfiguration. */
export function serverEnv(): ServerEnv {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
      throw new Error(`Invalid server environment: ${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}
