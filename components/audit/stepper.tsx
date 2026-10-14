import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function Stepper({ steps, current, done, onSelect }: { steps: string[]; current: number; done: boolean[]; onSelect: (i: number) => void }) {
  return (
    <nav aria-label="Audit steps">
      <ol className="grid grid-cols-4 gap-2">
        {steps.map((label, i) => {
          const reachable = i === 0 || done.slice(0, i).every(Boolean);
          const active = i === current;
          return (
            <li key={label}>
              <button
                type="button"
                disabled={!reachable}
                onClick={() => onSelect(i)}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "group flex w-full flex-col items-start gap-2 border-t-4 pt-3 text-left transition-colors disabled:cursor-not-allowed",
                  active ? "border-brand-700" : done[i] ? "border-brand-600/50" : "border-slate-200",
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                    active ? "bg-brand-700 text-white" : done[i] ? "bg-brand-100 text-brand-800" : "bg-slate-100 text-slate-500",
                  )}
                >
                  {done[i] && !active ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span className={cn("text-xs font-medium sm:text-sm", active ? "text-slate-900" : "text-slate-500")}>{label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
