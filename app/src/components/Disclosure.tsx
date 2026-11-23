import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/arc/button/button";
import { cn } from "@/lib/utils";

/** A ghost toggle that reveals extra detail below it, for information most people never need. */
export function Disclosure({ label, defaultOpen = false, children, className }: {
  label: string;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className={cn("grid gap-4", className)}>
      <div>
        {/* Offset by the ghost button's padding and border so its text lines up with the content above. */}
        <Button type="button" variant="ghost" size="sm" className="-ml-[calc(var(--space-3)+1px)] [@media(pointer:coarse)]:min-h-11" aria-expanded={open} aria-controls={id}
          onClick={() => setOpen(!open)}>
          {label}
          <ChevronDown className={cn("size-4 transition-transform motion-reduce:transition-none", open && "rotate-180")} aria-hidden="true" />
        </Button>
      </div>
      <div id={id} hidden={!open}>{open && children}</div>
    </div>
  );
}
