"use client";

import { RotateCcw } from "lucide-react";
import { catchError, type ErrorInfo } from "next/error";
import { PageContainer } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";

// Replaces (vault)/error.tsx: that file's chunk loaded late and React re-rendered in a busy loop while waiting for it.
function VaultError(_props: object, { error, retry }: ErrorInfo) {
  const digest = (error as Error & { digest?: string }).digest;
  return (
    <PageContainer>
      <div role="alert" className="mx-auto max-w-md rounded-lg border border-rose/40 bg-card p-6 text-center">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This page could not be loaded. Your saved progress is safe.{digest ? ` (ref ${digest})` : ""}
        </p>
        <Button className="mt-4" onClick={() => retry()}>
          <RotateCcw aria-hidden /> Try again
        </Button>
      </div>
    </PageContainer>
  );
}

export const VaultErrorBoundary = catchError(VaultError);
