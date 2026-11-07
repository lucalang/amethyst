import Link from "next/link";
import type { ReactNode } from "react";
import { FlaskConical } from "lucide-react";
import "./lab.css";

/** The Lab's own site frame: brand, breadcrumb and the sandbox notice. */
export function LabSite({ current, children }: { current?: string; children: ReactNode }) {
  return (
    <div className="lab-site">
      <div className="lab-wrap">
        <header className="lab-bar">
          <nav aria-label="The Lab" className="min-w-0">
            <ol className="lab-crumbs">
              <li>
                <Link href="/lab" className="lab-brand" aria-current={current ? undefined : "page"}>
                  <span aria-hidden className="lab-mark">
                    <FlaskConical className="size-4" strokeWidth={2.25} />
                  </span>
                  The Lab
                </Link>
              </li>
              {current ? (
                <li className="min-w-0">
                  <span aria-current="page" className="lab-crumb-current">
                    {current}
                  </span>
                </li>
              ) : null}
            </ol>
          </nav>
          <span className="lab-status">Sandbox · nothing is saved</span>
        </header>
        {children}
      </div>
    </div>
  );
}
