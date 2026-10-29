import { MediaImage } from "@/components/media/media-image";
import type { HomePreview } from "@/lib/data/home";
import { cn } from "@/lib/utils";

/** The overlapping cover artwork shown for a collection, first cover on top. */
export function CoverStack({ previews, hoverGroup = false }: { previews: Pick<HomePreview, "id" | "title" | "coverUrl" | "coverShape">[]; hoverGroup?: boolean }) {
  return (
    <span aria-hidden className="flex h-24 shrink-0 items-end">
      {previews.map((preview, index) => (
        <span
          key={preview.id}
          className={cn(
            "relative overflow-hidden rounded-md border border-black bg-surface ring-1 ring-white/[0.1] transition-[rotate,translate] duration-300",
            preview.coverShape === "square" ? "size-[4.5rem]" : "h-24 w-16",
            index > 0 && "-ml-6",
            hoverGroup && index === 1 && "group-hover/collection:translate-x-1",
            hoverGroup && index === 2 && "group-hover/collection:translate-x-2",
          )}
          style={{ zIndex: previews.length - index }}
        >
          <MediaImage src={preview.coverUrl} alt="" fallbackLabel={preview.title} className="text-xs" />
        </span>
      ))}
    </span>
  );
}
