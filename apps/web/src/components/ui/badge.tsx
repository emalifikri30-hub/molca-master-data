import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { Slot } from "radix-ui";

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        secondary: "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
        destructive:
          "bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
        outline: "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
        ghost: "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
        link: "text-primary underline-offset-4 hover:underline",
        /* Molca semantic soft variants (deltas, results) */
        success: "bg-success-soft text-success",
        warning:
          "bg-warning-soft text-[color-mix(in_oklab,var(--warning)_75%,black)] dark:text-warning",
        danger: "bg-danger-soft text-danger",
        info: "bg-highlight-soft text-highlight",
        /* Machine / order status: neutral pill, color lives only in the dot */
        status: "border-border bg-card text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

/** Universal machine-state colors for the status dot. Never brand colors. */
const statusDot = {
  run: "bg-st-run",
  small: "bg-st-small",
  unplanned: "bg-st-unplanned",
  planned: "bg-st-planned",
  off: "bg-st-off",
} as const;

type BadgeStatus = keyof typeof statusDot;

function Badge({
  className,
  variant = "default",
  asChild = false,
  status,
  children,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & {
    asChild?: boolean;
    /** Renders a leading state dot (run, small, unplanned, planned, off). Ignored with asChild. */
    status?: BadgeStatus;
  }) {
  const Comp = asChild ? Slot.Root : "span";

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    >
      {status && !asChild && (
        <span
          data-slot="badge-dot"
          aria-hidden
          className={cn("size-1.5 shrink-0 rounded-full", statusDot[status])}
        />
      )}
      {children}
    </Comp>
  );
}

export { Badge, badgeVariants, type BadgeStatus };
