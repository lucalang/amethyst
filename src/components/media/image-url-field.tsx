"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ImageIcon, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api-client";
import { ATTACHMENT_TYPES, attachmentUrl, isUploadedImagePath, uploadedImageName } from "@/lib/attachments";
import { uploadImage } from "@/lib/upload-image";
import { cn } from "@/lib/utils";
import { IMAGE_URL_MESSAGES, checkImageUrl, imageProxyUrl } from "@/lib/validation/image-url";

type CheckResult = { ok: true; contentType: string; bytes: number } | { ok: false; code: string; message: string };

function formatBytes(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Artwork from a link (checked and previewed through the proxy) or uploaded from the device. */
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
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value.trim()), 450);
    return () => window.clearTimeout(timer);
  }, [value]);

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const path = attachmentUrl(await uploadImage(file, "file"));
      setValue(path);
      setDebounced(path);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Could not upload the image.");
    } finally {
      setUploading(false);
    }
  }

  const uploaded = isUploadedImagePath(value.trim());
  const syntax = debounced && !uploaded ? checkImageUrl(debounced) : null;
  const check = useQuery({
    queryKey: ["image-check", debounced],
    queryFn: ({ signal }) => apiFetch<CheckResult>(`/api/image?mode=check&url=${encodeURIComponent(debounced)}`, { signal }),
    enabled: Boolean(syntax?.ok),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const typing = value.trim() !== debounced;
  const previewable = !typing && syntax?.ok && check.data?.ok && broken !== debounced;
  const previewSrc = uploaded && broken !== value.trim() ? value.trim() : previewable ? imageProxyUrl(debounced) : null;
  let tone: "muted" | "ok" | "warn" = "muted";
  let message: string = hint;
  if (error) {
    tone = "warn";
    message = error;
  } else if (uploading) {
    message = "Uploading image…";
  } else if (uploadError) {
    tone = "warn";
    message = uploadError;
  } else if (uploaded) {
    tone = "ok";
    message = "Uploaded from your device.";
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
    <div
      className={cn("space-y-1.5 rounded-lg transition-[box-shadow,background-color] duration-200", dragging && "bg-amethyst/[0.06] shadow-[0_0_0_2px_rgb(165_124_255/0.5)]")}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.files.length) return;
        event.preventDefault();
        setDragging(false);
        void upload([...event.dataTransfer.files].find((file) => file.type.startsWith("image/")) ?? event.dataTransfer.files[0]);
      }}
    >
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "relative grid shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-surface",
            shape === "poster" ? "aspect-[2/3] w-14" : shape === "square" ? "aspect-square w-16" : "aspect-[16/7] w-24",
          )}
        >
          {previewSrc ? (
            // eslint-disable-next-line @next/next/no-img-element -- own upload or authenticated proxy preview
            <img
              src={previewSrc}
              alt={`${label} preview`}
              className="absolute inset-0 h-full w-full object-cover"
              onError={() => setBroken(uploaded ? value.trim() : debounced)}
            />
          ) : uploading || check.isFetching ? (
            <Loader2 aria-hidden className="size-4 animate-spin text-muted-foreground" />
          ) : (
            <ImageIcon aria-hidden className="size-4 text-muted-foreground/60" />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex gap-2">
            {uploaded ? (
              <>
                <input type="hidden" name={name} value={value.trim()} />
                <div
                  id={id}
                  tabIndex={-1}
                  className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-md border border-amethyst/35 bg-amethyst/[0.08] px-3 text-sm"
                  title={uploadedImageName(value.trim())}
                >
                  <ImageIcon aria-hidden className="size-4 shrink-0 text-amethyst" />
                  <span className="min-w-0 truncate">{uploadedImageName(value.trim())}</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-10 shrink-0 text-muted-foreground hover:text-rose"
                  aria-label={`Remove ${label.toLowerCase()}`}
                  onClick={() => {
                    setValue("");
                    setDebounced("");
                  }}
                >
                  <X aria-hidden />
                </Button>
              </>
            ) : (
              <Input
                id={id}
                name={name}
                type="url"
                inputMode="url"
                placeholder="https://… or upload an image"
                value={value}
                maxLength={2048}
                onChange={(event) => {
                  setValue(event.target.value);
                  setUploadError(null);
                }}
                aria-invalid={Boolean(error) || (syntax !== null && !syntax.ok)}
                aria-describedby={statusId}
                className="h-10 min-w-0 flex-1"
              />
            )}
            <Button
              type="button"
              variant="outline"
              className="h-10 shrink-0 px-3"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              aria-label={`Upload ${label.toLowerCase().replace(/ url$/, "")} from your device`}
            >
              {uploading ? <Loader2 aria-hidden className="animate-spin" /> : <Upload aria-hidden />}
              <span className="max-sm:hidden">{uploaded ? "Replace" : "Upload"}</span>
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept={Object.keys(ATTACHMENT_TYPES).join(",")}
              hidden
              tabIndex={-1}
              aria-hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                void upload(file);
              }}
            />
          </div>
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
