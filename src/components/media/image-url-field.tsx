"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ImageIcon, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { IMAGE_URL_MESSAGES, checkImageUrl, imageProxyUrl } from "@/lib/validation/image-url";

type CheckResult = { ok: true; contentType: string; bytes: number } | { ok: false; code: string; message: string };

function formatBytes(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Artwork URL input with a live, proxied preview and an honest explanation when a link will not work. */
export function ImageUrlField({
  id,
  name,
  label,
  hint,
  defaultValue,
  error,
  shape,
}: {
  id: string;
  name: string;
  label: string;
  hint: string;
  defaultValue?: string | null;
  error?: string;
  shape: "poster" | "square" | "banner";
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [debounced, setDebounced] = useState((defaultValue ?? "").trim());
  const [broken, setBroken] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value.trim()), 450);
    return () => window.clearTimeout(timer);
  }, [value]);

  const syntax = debounced ? checkImageUrl(debounced) : null;
  const check = useQuery({
    queryKey: ["image-check", debounced],
    queryFn: ({ signal }) => apiFetch<CheckResult>(`/api/image?mode=check&url=${encodeURIComponent(debounced)}`, { signal }),
    enabled: Boolean(syntax?.ok),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const typing = value.trim() !== debounced;
  const previewable = !typing && syntax?.ok && check.data?.ok && broken !== debounced;
  let tone: "muted" | "ok" | "warn" = "muted";
  let message: string = hint;
  if (error) {
    tone = "warn";
    message = error;
  } else if (!debounced || typing) {
    message = hint;
  } else if (syntax && !syntax.ok) {
    tone = "warn";
    message = IMAGE_URL_MESSAGES[syntax.problem];
  } else if (check.isPending) {
    message = "Checking image…";
  } else if (check.isError) {
    tone = "warn";
    message = "Could not check this image right now. You can still save it.";
  } else if (check.data && !check.data.ok) {
    tone = "warn";
    message = `${check.data.message} You can still save the link, but it will show a placeholder.`;
  } else if (check.data?.ok) {
    tone = "ok";
    message = `Image found · ${check.data.contentType.replace("image/", "").toUpperCase()} · ${formatBytes(check.data.bytes)}`;
  }
  const statusId = `${id}-status`;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "relative grid shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-surface",
            shape === "poster" ? "aspect-[2/3] w-14" : shape === "square" ? "aspect-square w-16" : "aspect-[16/7] w-24",
          )}
        >
          {previewable ? (
            // eslint-disable-next-line @next/next/no-img-element -- preview through the authenticated image proxy
            <img
              src={imageProxyUrl(debounced)}
              alt={`${label} preview`}
              className="absolute inset-0 h-full w-full object-cover"
              onError={() => setBroken(debounced)}
            />
          ) : check.isFetching ? (
            <Loader2 aria-hidden className="size-4 animate-spin text-muted-foreground" />
          ) : (
            <ImageIcon aria-hidden className="size-4 text-muted-foreground/60" />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <Input
            id={id}
            name={name}
            type="url"
            inputMode="url"
            placeholder="https://…"
            value={value}
            maxLength={2048}
            onChange={(event) => setValue(event.target.value)}
            aria-invalid={Boolean(error) || (syntax !== null && !syntax.ok)}
            aria-describedby={statusId}
            className="h-10"
          />
          <p
            id={statusId}
            role="status"
            aria-live="polite"
            className={cn(
              "flex items-start gap-1.5 text-xs",
              tone === "ok" ? "text-amethyst" : tone === "warn" ? "text-rose" : "text-muted-foreground",
            )}
          >
            {tone === "ok" ? <CheckCircle2 aria-hidden className="mt-px size-3.5 shrink-0" /> : null}
            {tone === "warn" ? <AlertTriangle aria-hidden className="mt-px size-3.5 shrink-0" /> : null}
            <span>{message}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
