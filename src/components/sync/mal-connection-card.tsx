import Link from "next/link";
import { ExternalLink, Link2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Tables } from "@/lib/supabase/database.types";
import { formatRelative } from "@/lib/format";
import { DisconnectMalButton } from "./disconnect-mal-button";

type Account = Tables<"mal_accounts"> | null;

export function connectionLabel(account: Account): { label: string; tone: "jade" | "coral" | "muted" } {
  if (!account || account.status === "disconnected") return { label: "Not connected", tone: "muted" };
  if (account.status === "reconnect_required") return { label: "Reconnect required", tone: "coral" };
  if (account.initial_sync !== "approved") return { label: "Awaiting review", tone: "coral" };
  return { label: account.outbound_enabled ? "Syncing" : "Connected (read-only)", tone: "jade" };
}

export function MalConnectionCard({ account, configured }: { account: Account; configured: boolean }) {
  const connected = account && account.status !== "disconnected";
  const status = connectionLabel(account);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>MyAnimeList</CardTitle>
          <Badge
            variant="outline"
            className={
              status.tone === "jade" ? "border-jade/40 text-jade" : status.tone === "coral" ? "border-coral/40 text-coral" : ""
            }
          >
            {status.label}
          </Badge>
        </div>
        <CardDescription>
          Separate from your archive sign-in. Syncs status, score and watched-episode counts for MAL-linked anime only. Games,
          arcs, checklists and private notes never leave this archive.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!configured ? (
          <p className="text-muted-foreground">
            MyAnimeList is not configured on this server. Set <code>MAL_CLIENT_ID</code> and <code>MAL_REDIRECT_URI</code>.
          </p>
        ) : connected ? (
          <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="text-muted-foreground">Account</dt>
              <dd>{account.mal_username ?? "Unknown"}</dd>
              <dt className="text-muted-foreground">Last pull</dt>
              <dd>{account.last_pull_at ? formatRelative(account.last_pull_at) : "Not yet"}</dd>
              <dt className="text-muted-foreground">Last push</dt>
              <dd>{account.last_push_at ? formatRelative(account.last_push_at) : "Not yet"}</dd>
            </dl>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/sync">Open sync center</Link>
              </Button>
              {account.status === "reconnect_required" ? (
                <Button asChild variant="outline">
                  <a href="/api/mal/connect">
                    <Link2 aria-hidden /> Reconnect
                  </a>
                </Button>
              ) : null}
              <DisconnectMalButton />
            </div>
          </>
        ) : (
          <Button asChild>
            <a href="/api/mal/connect">
              <ExternalLink aria-hidden /> Connect MyAnimeList
            </a>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
