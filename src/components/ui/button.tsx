import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-md border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,translate,scale,filter] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] outline-none select-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 active:duration-100 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:transition-[translate,scale,rotate,color] [&_svg]:duration-200 [&_svg]:ease-[cubic-bezier(0.34,1.56,0.64,1)] [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Primary: the one main action in a place. Strong fill, a small lift on hover, no wobble.
        default:
          "btn-sheen relative isolate overflow-hidden bg-[linear-gradient(135deg,var(--primary-hi),var(--primary)_48%,var(--primary-lo))] font-semibold text-primary-foreground shadow-[inset_0_1px_0_rgb(var(--ink-rgb)/0.3),0_1px_2px_rgb(var(--shadow-rgb)/calc(0.6*var(--shadow-alpha)))] hover:-translate-y-px hover:brightness-110 hover:shadow-[inset_0_1px_0_rgb(var(--ink-rgb)/0.35),0_0_0_1px_rgb(var(--accent-soft-rgb)/0.5),0_10px_26px_-10px_rgb(var(--accent-rgb)/0.8)] focus-visible:shadow-[0_0_0_1px_rgb(var(--accent-soft-rgb)/0.55),0_8px_24px_-8px_rgb(var(--accent-rgb)/0.8)] active:translate-y-0 active:scale-[0.97] active:brightness-95 active:shadow-[inset_0_2px_6px_rgb(var(--shadow-rgb)/calc(0.35*var(--shadow-alpha)))]",
        // Secondary: a supporting action with weight. Tinted fill in the accent, quieter than primary.
        secondary:
          "border-amethyst/25 bg-amethyst/[0.12] text-foreground shadow-[inset_0_1px_0_rgb(var(--ink-rgb)/0.06)] hover:border-amethyst/45 hover:bg-amethyst/[0.2] hover:[&_svg]:text-amethyst aria-expanded:border-amethyst/45 aria-expanded:bg-amethyst/[0.2] active:scale-[0.97]",
        // Outline: neutral actions and toolbars. Border and text only; the accent appears on hover.
        outline:
          "border-border bg-foreground/[0.02] hover:border-amethyst/50 hover:bg-foreground/[0.05] hover:text-foreground hover:[&_svg]:text-amethyst aria-expanded:border-amethyst/50 aria-expanded:bg-amethyst/10 aria-expanded:text-foreground active:scale-[0.97] active:bg-foreground/[0.08]",
        // Ghost: icon buttons and inline actions with no surface until hovered.
        ghost:
          "hover:bg-foreground/[0.07] hover:text-foreground hover:[&_svg]:text-amethyst aria-expanded:bg-foreground/[0.08] aria-expanded:text-foreground active:scale-[0.95] active:bg-foreground/[0.11]",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 hover:shadow-[inset_0_0_0_1px_rgb(255_107_107/0.4),0_0_22px_-6px_rgb(255_107_107/0.55)] focus-visible:border-destructive/40 focus-visible:ring-destructive/20 active:scale-[0.95] dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline active:opacity-80",
      },
      size: {
        default:
          "h-10 gap-2 px-4",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-11 gap-2 px-5",
        icon: "size-10",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
