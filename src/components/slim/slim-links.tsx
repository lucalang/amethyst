"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowLeftRight } from "lucide-react";
import { FULL_NAME, fullPathFor } from "@/lib/edition";
import { cn } from "@/lib/utils";

/** A Slim navigation link that marks itself current (exactly, or for anything below it with `nested`). */
export function SlimNavLink({ href, nested = false, className, children }: { href: string; nested?: boolean; className?: string; children: ReactNode }) {
  const pathname = usePathname();
  const current = pathname === href || (nested && pathname.startsWith(`${href}/`));
  return (
    <Link href={href} aria-current={current ? "page" : undefined} className={cn("slim-nav-link", className)}>
      {children}
    </Link>
  );
}

/** Switches to the same page in the full app (or the Full archive when Slim's page has no exact twin). */
export function FullSwitch({ className }: { className?: string }) {
  const pathname = usePathname();
  return (
    <Link href={fullPathFor(pathname)} className={cn("slim-switch", className)} title={`Open this page in ${FULL_NAME}, with every feature`}>
      <ArrowLeftRight aria-hidden className="size-4" />
      <span>{FULL_NAME}</span>
    </Link>
  );
}
