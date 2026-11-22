import "@/components/arc/foundation.css";
import "@/client/index.css";
import "@/client/theme";

import type { ReactNode } from "react";
import { LayoutDashboard, Map } from "lucide-react";
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
 * - "app": nav (World, Dashboard)
 * - "focus": logo + theme only, for the live date
 *
 * `bleed` drops the main column's width and padding so a page (the 3D world) fills everything below the header.
 */
export function AppShell({
  children,
  variant = "app",
  wide = false,
  bleed = false,
}: {
  children: ReactNode;
  variant?: ShellVariant;
  wide?: boolean;
  bleed?: boolean;
}) {
  const { theme, setTheme } = useTheme();
  const width = wide || bleed ? "max-w-6xl" : "max-w-5xl";

  return (
    <div className={cn("flex flex-col bg-background text-foreground", bleed ? "h-dvh" : "min-h-dvh")}>
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md">
        <div className={cn("mx-auto flex h-14 items-center gap-3 px-4 sm:px-6", width)}>
          <NavLink to="/" className="rounded-full" aria-label="bantr home">
            <Logo compact={variant === "app"} />
          </NavLink>

          {variant === "app" && (
            <nav aria-label="Main" className="ml-2 flex items-center gap-1">
              <NavLink to="/" end className={navClass}>
                <Map className="size-4" aria-hidden="true" />
                <span>World</span>
              </NavLink>
              <NavLink to="/dashboard" end className={navClass}>
                <LayoutDashboard className="size-4" aria-hidden="true" />
                <span>Dashboard</span>
              </NavLink>
            </nav>
          )}

          <div className="ml-auto flex items-center gap-2">
            <ThemeSwitch theme={theme} iconOnly onThemeChange={(next) => setTheme(next)} />
          </div>
        </div>
      </header>

      <main className={cn(bleed ? "relative flex min-h-0 flex-1 flex-col" : cn("mx-auto w-full flex-1 px-4 py-8 sm:px-6 sm:py-10", width))}>
        {children}
      </main>

      {variant !== "focus" && !bleed && (
        <footer className="border-t border-border">
          <div className={cn("mx-auto flex flex-col gap-1 px-4 py-6 text-xs text-faint sm:flex-row sm:justify-between sm:px-6", width)}>
            <span>bantr</span>
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
