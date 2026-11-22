import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A plain surface on Arc tokens, for layout regions that don't fit Arc's structured Card. */
export function Panel({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cn("rounded-(--radius-panel) border border-border bg-surface p-5 shadow-(--shadow-resting) sm:p-6", className)}
      {...props}
    />
  );
}

export function PanelHeader({ title, description, action, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-4 flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <h2 className="text-lg text-foreground">{title}</h2>
        {description && <p className="mt-1 text-sm text-subtle">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-3xl text-foreground sm:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-prose text-base text-subtle">{description}</p>}
      </div>
      {action}
    </div>
  );
}
