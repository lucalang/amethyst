"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Unlink } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";

export function DisconnectMalButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function disconnect() {
    setPending(true);
    try {
      await apiFetch("/api/mal/disconnect", { method: "POST" });
      toast.success("MyAnimeList disconnected. Your local progress is unchanged.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not disconnect.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" disabled={pending}>
          <Unlink aria-hidden /> Disconnect
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Disconnect MyAnimeList?</AlertDialogTitle>
          <AlertDialogDescription>
            Stored tokens, the cached MAL list and sync baselines are deleted and pending pushes are cancelled. Your archive
            progress is kept, and nothing is removed from your MyAnimeList account.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={disconnect}>Disconnect</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
