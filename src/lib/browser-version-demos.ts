export const BROWSER_DEMO_SPECS = [
  {
    sha: "4cd98fceef80408437788fe99a203bf3a079a218",
    title: "Personal Entry Workspaces",
    summary: "The first personal library, with type filters, note write/preview modes and workspace checklists.",
    defaultPath: "/",
  },
  {
    sha: "3c27ef532b3fa8bd60968b0f9841348fde95ca8b",
    title: "Amethyst Archives Launch",
    summary: "Fixed libraries, live Markdown notes and checklists with task details.",
    defaultPath: "/anime",
  },
  {
    sha: "a33650c9d40e8baf4bb0e8ba3f9825c970c555de",
    title: "Interaction Polish & Square Game Covers",
    summary: "Polished entrances and controls, To Do-style checklists and square game artwork.",
    defaultPath: "/anime",
  },
  {
    sha: "41c0112c17c378d94c50f72fa7c04ddc9803e88b",
    title: "Initial Deployment Snapshot",
    summary: "The initial deployment snapshot; its interface is unchanged from a33650c.",
    defaultPath: "/anime",
  },
  {
    sha: "bb143985e1c1c3c750b152039762ae1f2c8594f7",
    title: "Package Registry Snapshot",
    summary: "The package-registry configuration snapshot; its interface is unchanged from a33650c.",
    defaultPath: "/anime",
  },
  {
    sha: "896927604d34e756a3f663e3ba796e43e9ea2bfe",
    title: "Other Collection Navigation",
    summary: "Other becomes always visible in navigation and joins the New-entry menu.",
    defaultPath: "/anime",
  },
] as const;

export type BrowserDemoSpec = (typeof BROWSER_DEMO_SPECS)[number];

export function findBrowserDemoSpec(sha: string) {
  return BROWSER_DEMO_SPECS.find((spec) => spec.sha === sha || spec.sha.slice(0, 7) === sha) ?? null;
}

export function isBrowserDemoPath(pathname: string) {
  const match = /^\/demos\/([0-9a-f]{7})(?:\/(index\.html|preview\.(?:js|css)|cover\.jpg|source\.json|OFL\.txt|manrope-(?:400|500|600|700|800)\.ttf))?$/.exec(pathname);
  return Boolean(match && findBrowserDemoSpec(match[1]));
}