import type { ComponentProps } from "react";

export default function PreviewImage({ alt, className, width, height }: ComponentProps<"img">) {
  return <img src="./cover.jpg" alt={alt ?? ""} className={className} width={width} height={height} />;
}

export function MediaImage({ src, alt, className, priority }: { src?: string | null; alt: string; className?: string; priority?: boolean; fallbackLabel?: string }) {
  return <img src={src || "./cover.jpg"} alt={alt} loading={priority ? "eager" : "lazy"} className={`absolute inset-0 h-full w-full object-cover ${className ?? ""}`} />;
}
export function ImageUrlField(props: ComponentProps<"input"> & { label?: string }) {
  return <input aria-label={props.label ?? "Artwork"} disabled value="Sample artwork" readOnly />;
}