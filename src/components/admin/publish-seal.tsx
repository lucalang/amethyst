"use client";

import { useState } from "react";
import { Check, Copy, ShieldAlert } from "lucide-react";
import { DecodeText } from "@/components/vault/vault-reveal";
import { FOLD, PUBLISH } from "./admin-timing";
import { StatusPill } from "./admin-ui";

/**
 * The admin's publish confirmation, shown only after the server confirms: it mounts as the window
 * reopens, the emblem traces while the frame takes its crimson accent, then the real code decodes and
 * settles beside the Copy action. Shown this one time only.
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
          <DecodeText text={code} animate={animate} delay={animate ? PUBLISH.code - FOLD : 0} />
        </code>
        <button type="button" className="ax-btn" data-variant="primary" onClick={copy}>
          {copied === "yes" ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
          {copied === "yes" ? "Copied" : "Copy code"}
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
