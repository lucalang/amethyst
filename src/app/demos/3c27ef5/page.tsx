import type { Metadata } from "next";

export const metadata: Metadata = { title: "Amethyst Archives launch demo" };

export default function LaunchPreviewPage() {
  return <iframe title="Amethyst Archives launch preview, commit 3c27ef5" src="/demos/3c27ef5/index.html" className="fixed inset-0 h-dvh w-full border-0" sandbox="allow-scripts allow-same-origin allow-top-navigation-by-user-activation" />;
}