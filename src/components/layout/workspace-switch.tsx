"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LibraryBig, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";

const LAST_PATH_KEY = { archive: "archive:last-archive-path", tasks: "archive:last-tasks-path" } as const;

export const isTasksPath = (pathname: string) => pathname === "/tasks" || pathname.startsWith("/tasks/");

function readPath(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Archive | Tasks switch next to the app identity; each side reopens where you left it. */
export function WorkspaceSwitch({ className }: { className?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const inTasks = isTasksPath(pathname);

  useEffect(() => {
    try {
      const path = `${pathname}${window.location.search}`;
      sessionStorage.setItem(inTasks ? LAST_PATH_KEY.tasks : LAST_PATH_KEY.archive, path);
    } catch {
      // Remembering the last page is a convenience only.
    }
  }, [pathname, inTasks]);

  const items = [
    { id: "archive" as const, label: "Archive", href: "/", icon: LibraryBig, active: !inTasks },
    { id: "tasks" as const, label: "Tasks", href: "/tasks", icon: ListChecks, active: inTasks },
  ];

  return (
    <nav aria-label="Workspace" className={cn("flex shrink-0 items-center rounded-lg bg-white/[0.04] p-0.5 ring-1 ring-white/[0.08]", className)}>
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          onClick={(event) => {
            if (item.active || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
            const last = readPath(LAST_PATH_KEY[item.id]);
            if (last && last !== item.href) {
              event.preventDefault();
              router.push(last);
            }
          }}
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-muted-foreground transition-[color,background-color,box-shadow] duration-200 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60",
            item.active && "bg-amethyst/15 text-foreground shadow-[inset_0_0_0_1px_rgb(var(--accent-rgb)/0.3)] [&_svg]:text-amethyst",
          )}
        >
          <item.icon aria-hidden className="size-4" />
          <span className="max-sm:sr-only">{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}
