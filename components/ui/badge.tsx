import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", {
  variants: {
    variant: {
      default: "border-transparent bg-brand-50 text-brand-800",
      secondary: "border-transparent bg-slate-100 text-slate-700",
      outline: "text-slate-700",
      high: "border-transparent bg-red-50 text-red-700",
      medium: "border-transparent bg-amber-50 text-amber-800",
      low: "border-transparent bg-slate-100 text-slate-600",
    },
  },
  defaultVariants: { variant: "default" },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
