import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BROWSER_DEMO_SPECS, findBrowserDemoSpec } from "@/lib/browser-version-demos";

type Props = { params: Promise<{ sha: string }> };

export function generateStaticParams() {
  return BROWSER_DEMO_SPECS.filter((spec) => spec.sha.slice(0, 7) !== "3c27ef5").map((spec) => ({ sha: spec.sha.slice(0, 7) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { sha } = await params;
  const spec = findBrowserDemoSpec(sha);
  return { title: spec ? `${spec.title} demo` : "Demo not found" };
}

export default async function HistoricalPreviewPage({ params }: Props) {
  const { sha } = await params;
  const spec = /^[0-9a-f]{7}$/.test(sha) ? findBrowserDemoSpec(sha) : null;
  if (!spec) notFound();
  return <iframe title={`${spec.title}, commit ${sha}`} src={`/demos/${sha}/index.html`} className="fixed inset-0 h-dvh w-full border-0" sandbox="allow-scripts allow-same-origin allow-top-navigation-by-user-activation" />;
}