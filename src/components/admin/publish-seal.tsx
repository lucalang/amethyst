"use client";

import { useState } from "react";
import { Check, Copy, ShieldAlert } from "lucide-react";
import { DecodeText } from "@/components/vault/vault-reveal";
import { StatusPill } from "./admin-ui";

/**
 * The admin's publish confirmation: the emblem ring traces, the check settles, then the code
 * plate is scanned and decoded. Shown this one time only.
 */
export default function PublishSeal({ code, status, animate }: { code: string; status: "active" | "scheduled"; animate: boolean }) {
  const [copied, setCopied] = useState<"yes" | "failed" | null>(null);

  function copy() {
    navigator.clipboard.writeText(code).then(
      () => setCopied("yes"),
      () => setCopied("failed"),
    );
  }

  return (
    <div className="ax-forge" data-animate={animate ? "" : undefined}>
      <svg className="ax-emblem" viewBox="0 0 100 100" aria-hidden>
        <path className="ax-emblem-ticks" d="M50 1v8M99 50h-8M50 99v-8M1 50h8" />
        <circle className="ax-emblem-line" cx="50" cy="50" r="40" pathLength={1} />
        <circle className="ax-emblem-line" data-delay="1" cx="50" cy="50" r="33" pathLength={1} />
        <path className="ax-emblem-check" d="M36 51l10 10 19-21" pathLength={1} />
      </svg>
      <StatusPill status={status} />
      <div className="ax-codeplate">
        <code aria-label={code}>
          <DecodeText text={code} animate={animate} delay={animate ? 700 : 0} />
        </code>
        <button type="button" className="ax-btn" data-size="sm" onClick={copy}>
          {copied === "yes" ? <Check aria-hidden className="size-3.5" /> : <Copy aria-hidden className="size-3.5" />}
          {copied === "yes" ? "Copied" : "Copy"}
        </button>
      </div>
      <p role="status" className="ax-hint">
        {copied === "failed" ? "Copying was blocked. Select the code and copy it by hand." : null}
      </p>
      <p className="ax-warning">
        <ShieldAlert aria-hidden className="size-4 shrink-0" />
        Shown only this once. The Archive keeps just its hash, so it can’t be shown or recovered later. Copy it before you leave this page.
      </p>
    </div>
  );
}
