import "@/components/arc/foundation.css";
import "@/client/index.css";
import "@/client/theme";

import type { ReactNode } from "react";
import { LayoutDashboard, Plus } from "lucide-react";
import { NavLink } from "wasp/client/router";
import { ThemeSwitch } from "@/components/arc/theme-switch/theme-switch";
import { Logo } from "@/components/Logo";
import { useTheme } from "@/client/theme";
import { cn } from "@/lib/utils";

type ShellVariant = "app" | "focus";

/**
 * Page frame: header (logo, nav, theme toggle) and a centered main column.
 * Every page wraps itself in this for now. It could become Wasp's `client.rootComponent`
 * (then the CSS/theme imports move with it and pages drop the wrapper).
 *
 * - "app": nav (Dashboard, New date)
 * - "focus": logo + theme only, for the live date
 */
export function AppShell({ children, variant = "app", wide = false }: { children: ReactNode; variant?: ShellVariant; wide?: boolean }) {
  const { theme, setTheme } = useTheme();
  const width = wide ? "max-w-6xl" : "max-w-5xl";

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md">
        <div className={cn("mx-auto flex h-14 items-center gap-3 px-4 sm:px-6", width)}>
          <NavLink to="/" className="rounded-full" aria-label="Dating Sandbox home">
            <Logo compact={variant === "app"} />
          </NavLink>

          {variant === "app" && (
            <nav aria-label="Main" className="ml-2 flex items-center gap-1">
              <NavLink to="/" end className={navClass}>
                <LayoutDashboard className="size-4" aria-hidden="true" />
                <span>Dashboard</span>
              </NavLink>
              <NavLink to="/" hash="new-date" className={() => navClass({ isActive: false })}>
                <Plus className="size-4" aria-hidden="true" />
                <span>New date</span>
              </NavLink>
            </nav>
          )}

          <div className="ml-auto flex items-center gap-2">
            <ThemeSwitch theme={theme} iconOnly onThemeChange={(next) => setTheme(next)} />
          </div>
        </div>
      </header>

      <main className={cn("mx-auto w-full flex-1 px-4 py-8 sm:px-6 sm:py-10", width)}>{children}</main>

      {variant !== "focus" && (
        <footer className="border-t border-border">
          <div className={cn("mx-auto flex flex-col gap-1 px-4 py-6 text-xs text-faint sm:flex-row sm:justify-between sm:px-6", width)}>
            <span>Dating Sandbox</span>
            <span>Voice by ElevenLabs</span>
          </div>
        </footer>
      )}
    </div>
  );
}

function navClass({ isActive }: { isActive: boolean }) {
  return cn(
    "inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-sm text-subtle transition-colors hover:bg-surface-muted hover:text-foreground sm:px-3",
    "[&>span]:sr-only sm:[&>span]:not-sr-only",
    isActive && "bg-surface-muted text-foreground",
  );
}
