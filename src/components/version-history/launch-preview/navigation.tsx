import { useSyncExternalStore, type ComponentProps } from "react";

function subscribe(listener: () => void) {
  window.addEventListener("hashchange", listener);
  window.addEventListener("popstate", listener);
  return () => { window.removeEventListener("hashchange", listener); window.removeEventListener("popstate", listener); };
}
function snapshot() { return location.hash.slice(1) || __PREVIEW_DEFAULT_PATH__; }
export function usePathname() { return useSyncExternalStore(subscribe, snapshot, () => __PREVIEW_DEFAULT_PATH__).split("?")[0]; }
export function useSearchParams() {
  const route = useSyncExternalStore(subscribe, snapshot, () => "/anime");
  return new URLSearchParams(location.search || route.split("?")[1] || "");
}
function navigate(url: string, replace = false) {
  const safe = new URL(url, "https://preview.invalid");
  if (safe.origin !== "https://preview.invalid") return;
  const destination = `#${safe.pathname}${safe.search}`;
  if (replace) history.replaceState(null, "", `${location.pathname}${destination}`);
  else history.pushState(null, "", `${location.pathname}${destination}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo(0, 0);
}
export function useRouter() {
  return { push: (url: string) => navigate(url), replace: (url: string) => navigate(url, true), refresh: () => location.reload(), back: () => history.back(), prefetch: () => {} };
}
export default function PreviewLink({ href, children, ...props }: Omit<ComponentProps<"a">, "href"> & { href: string }) {
  const disabled = /\/(new|settings)(\/|\?|$)/.test(href);
  if (disabled) return <span {...props} aria-disabled="true" data-preview-disabled="true" title="Unavailable in this demo" style={{ ...props.style, opacity: 0.45, cursor: "not-allowed" }}>{children}</span>;
  return <a {...props} href={`#${href}`} onClick={(event) => {
    props.onClick?.(event);
    if (!event.defaultPrevented && !event.ctrlKey && !event.metaKey && !event.shiftKey) { event.preventDefault(); navigate(href); }
  }}>{children}</a>;
}