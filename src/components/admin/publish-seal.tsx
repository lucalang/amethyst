"use client";

import { useState } from "react";
import { Check, Copy, ShieldAlert } from "lucide-react";
import { DecodeText } from "@/components/vault/vault-reveal";

const TICKS = Array.from({ length: 48 }, (_, index) => index);

/** The admin's publish confirmation: an inscription ring seals the new code, shown this one time. */
export default function PublishSeal({ code, animate }: { code: string; animate: boolean }) {
  const [copied, setCopied] = useState<"yes" | "failed" | null>(null);

  function copy() {
    navigator.clipboard.writeText(code).then(
      () => setCopied("yes"),
      () => setCopied("failed"),
    );
  }

  return (
    <div className="ax-forge" data-animate={animate ? "" : undefined}>
      <div className="ax-sigil-wrap" aria-hidden>
        <svg className="ax-sigil" viewBox="0 0 200 200">
          <g className="ax-sigil-ticks">
            {TICKS.map((index) => (
              <line key={index} x1="100" y1="5" x2="100" y2={index % 4 === 0 ? 15 : 10} transform={`rotate(${index * 7.5} 100 100)`} />
            ))}
          </g>
          <circle className="ax-sigil-line" cx="100" cy="100" r="88" pathLength={1} />
          <circle className="ax-sigil-line" data-delay="1" cx="100" cy="100" r="70" pathLength={1} />
          <path className="ax-sigil-line" data-delay="2" d="M100 46 L140 100 L100 154 L60 100 Z" pathLength={1} />
          <path className="ax-sigil-core" d="M100 78 L116 100 L100 122 L84 100 Z" />
        </svg>
        <span className="ax-sigil-flash" />
      </div>
      <p className="ax-eyebrow">Code sealed</p>
      <div className="ax-codeplate">
        <code aria-label={code}>
          <DecodeText text={code} animate={animate} delay={animate ? 650 : 0} />
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
