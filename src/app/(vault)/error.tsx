"use client";

import { RotateCcw } from "lucide-react";
import { PageContainer } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";

export default function VaultError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <PageContainer>
      <div role="alert" className="mx-auto max-w-md rounded-lg border border-rose/40 bg-card p-6 text-center">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This page could not be loaded. Your saved progress is safe.{error.digest ? ` (ref ${error.digest})` : ""}
        </p>
        <Button className="mt-4" onClick={reset}>
          <RotateCcw aria-hidden /> Try again
        </Button>
      </div>
    </PageContainer>
  );
}
