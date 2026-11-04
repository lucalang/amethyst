import { ArtworkFrame } from "@/components/media/artwork-frame";
import { FRAME_MOTIFS } from "@/components/media/frame-motifs";
import type { FrameLookId } from "@/lib/frames";

// TEMP preview of the illustrated frames; delete before committing.
export default async function FrameProtoPage({ searchParams }: { searchParams: Promise<{ only?: string }> }) {
  const only = (await searchParams).only?.split(",");
  const ids = (Object.keys(FRAME_MOTIFS) as FrameLookId[]).filter((id) => !only || only.includes(id));
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-20 gap-y-28 p-28 pt-32">
      {ids.map((id) => (
        <figure key={id} className="flex flex-col items-center gap-6">
          <ArtworkFrame frame={id} className="w-[220px]">
            <div className="aspect-[2/3] w-full bg-gradient-to-br from-violet-400 via-fuchsia-500 to-indigo-800" />
          </ArtworkFrame>
          <figcaption className="text-sm opacity-70">{id}</figcaption>
        </figure>
      ))}
    </div>
  );
}
