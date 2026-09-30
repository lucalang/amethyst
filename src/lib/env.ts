import "server-only";
import { z } from "zod";
import { getAllowedImageHosts } from "@/lib/validation/image-hosts";
import { MAL_ENDPOINTS } from "@/lib/providers/mal";

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);
const optional = <T extends z.ZodType>(schema: T) => z.preprocess(emptyToUndefined, schema.optional());

const encryptionKey = z.string().refine((value) => {
  try {
    return Buffer.from(value, "base64").length === 32;
  } catch {
    return false;
  }
}, "must be the base64 encoding of exactly 32 bytes (openssl rand -base64 32)");

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  APP_URL: z.url(),
  SUPABASE_SECRET_KEY: z.string().min(1),
  TOKEN_ENCRYPTION_KEY: encryptionKey,
  WORKER_SECRET: optional(z.string().min(32)),
  WORKER_URL: optional(z.url()),
  MAL_CLIENT_ID: optional(z.string().min(1)),
  MAL_CLIENT_SECRET: optional(z.string().min(1)),
  MAL_REDIRECT_URI: optional(z.url()),
  // Endpoint overrides exist for automated tests against a local mock.
  MAL_AUTHORIZE_URL: optional(z.url()),
  MAL_TOKEN_URL: optional(z.url()),
  MAL_API_BASE_URL: optional(z.url()),
  JIKAN_BASE_URL: z.preprocess(emptyToUndefined, z.url().default("https://api.jikan.moe/v4")),
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

export type MalConfig = {
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  authorizeUrl: string;
  tokenUrl: string;
  apiBaseUrl: string;
};

/** MAL settings, or null when the integration is not configured. */
export function malConfig(): MalConfig | null {
  const env = serverEnv();
  if (!env.MAL_CLIENT_ID || !env.MAL_REDIRECT_URI) return null;
  return {
    clientId: env.MAL_CLIENT_ID,
    clientSecret: env.MAL_CLIENT_SECRET,
    redirectUri: env.MAL_REDIRECT_URI,
    authorizeUrl: env.MAL_AUTHORIZE_URL ?? MAL_ENDPOINTS.authorizeUrl,
    tokenUrl: env.MAL_TOKEN_URL ?? MAL_ENDPOINTS.tokenUrl,
    apiBaseUrl: env.MAL_API_BASE_URL ?? MAL_ENDPOINTS.apiBaseUrl,
  };
}

export function allowedImageHosts(): string[] {
  return getAllowedImageHosts(serverEnv().EXTRA_IMAGE_HOSTS);
}
