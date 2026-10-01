"use client";

import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env.public";
import type { Database } from "./database.types";

let client: ReturnType<typeof createBrowserClient<Database>> | undefined;

/** Browser Supabase client acting as the signed-in user (session from auth cookies, RLS applies). */
export function createClient() {
  client ??= createBrowserClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  return client;
}
