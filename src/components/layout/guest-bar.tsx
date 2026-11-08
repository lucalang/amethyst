import Link from "next/link";
import { Gamepad2 } from "lucide-react";

/** Slim notice under the top bar during a guest session. */
export function GuestBar() {
  return (
    <div className="border-b border-amethyst/20 bg-amethyst/[0.07]">
      <p className="mx-auto flex max-w-[88rem] flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2 text-xs text-muted-foreground md:px-6">
        <Gamepad2 aria-hidden className="size-3.5 shrink-0 text-amethyst" />
        <span className="font-semibold text-foreground">Guest mode</span>
        <span>You can play the Arcade. Collections, To Do, the Shop and everything else need an account.</span>
        <Link href="/register" className="font-semibold text-amethyst underline-offset-4 hover:underline">
          Create account
        </Link>
        <Link href="/guest" className="underline-offset-4 hover:text-foreground hover:underline">
          What guests can do
        </Link>
      </p>
    </div>
  );
}
