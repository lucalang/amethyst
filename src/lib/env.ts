import "server-only";
import { z } from "zod";
import { getAllowedImageHosts } from "@/lib/validation/image-hosts";

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);
const optional = <T extends z.ZodType>(schema: T) => z.preprocess(emptyToUndefined, schema.optional());

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  APP_URL: z.url(),
  EXTRA_IMAGE_HOSTS: optional(z.string()),
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

export function allowedImageHosts(): string[] {
  return getAllowedImageHosts(serverEnv().EXTRA_IMAGE_HOSTS);
}
