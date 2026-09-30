import { permanentRedirect } from "next/navigation";

// Imported franchises became anime workspaces; keep old links working.
export default async function LegacyFranchisePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  permanentRedirect(`/entries/${encodeURIComponent(id)}`);
}
