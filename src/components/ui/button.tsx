import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-md border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,translate,scale,filter] duration-200 ease-out outline-none select-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 active:duration-75 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:transition-[translate,scale,rotate,color] [&_svg]:duration-200 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "btn-sheen relative isolate overflow-hidden bg-[linear-gradient(135deg,var(--primary-hi),var(--primary)_48%,var(--primary-lo))] text-primary-foreground shadow-[inset_0_1px_0_rgb(var(--ink-rgb)/0.3),0_1px_2px_rgb(var(--shadow-rgb)/calc(0.6*var(--shadow-alpha)))] hover:-translate-y-px hover:brightness-110 hover:shadow-[inset_0_1px_0_rgb(var(--ink-rgb)/0.35),0_0_0_1px_rgb(var(--accent-soft-rgb)/0.55),0_10px_28px_-8px_rgb(var(--accent-rgb)/0.85)] hover:[&_svg]:scale-115 hover:[&_svg]:rotate-6 focus-visible:shadow-[0_0_0_1px_rgb(var(--accent-soft-rgb)/0.55),0_8px_24px_-8px_rgb(var(--accent-rgb)/0.8)] active:translate-y-px active:scale-[0.96] active:brightness-95 active:shadow-[inset_0_2px_6px_rgb(var(--shadow-rgb)/calc(0.35*var(--shadow-alpha)))]",
        outline:
          "border-border bg-foreground/[0.025] hover:-translate-y-px hover:border-amethyst/60 hover:bg-amethyst/10 hover:text-foreground hover:shadow-[inset_0_0_0_1px_rgb(var(--accent-rgb)/0.28),0_0_26px_-8px_rgb(var(--accent-rgb)/0.6)] hover:[&_svg]:text-amethyst aria-expanded:border-amethyst/50 aria-expanded:bg-amethyst/10 aria-expanded:text-foreground active:translate-y-0 active:scale-[0.96]",
        secondary:
          "bg-secondary text-secondary-foreground shadow-[inset_0_0_0_1px_rgb(var(--ink-rgb)/0.06)] hover:-translate-y-px hover:bg-accent hover:shadow-[inset_0_0_0_1px_rgb(var(--accent-rgb)/0.4),0_8px_22px_-10px_rgb(var(--accent-rgb)/0.6)] hover:[&_svg]:text-amethyst aria-expanded:bg-secondary aria-expanded:text-secondary-foreground active:translate-y-0 active:scale-[0.96]",
        ghost:
          "hover:bg-foreground/[0.07] hover:text-foreground hover:[&_svg]:scale-115 hover:[&_svg]:text-amethyst aria-expanded:bg-foreground/[0.08] aria-expanded:text-foreground active:scale-[0.93] active:bg-foreground/[0.11]",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 hover:shadow-[inset_0_0_0_1px_rgb(255_107_107/0.4),0_0_22px_-6px_rgb(255_107_107/0.55)] focus-visible:border-destructive/40 focus-visible:ring-destructive/20 active:scale-[0.96] dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-10 gap-2 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-11 gap-2 px-5 has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
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
