import { useCallback, useEffect, useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "bantr-theme";
/** Arc accent for the whole app. Arc ships neutral, violet, blue, green, amber, orange, coral and rose. */
export const APP_ACCENT = "rose";

const listeners = new Set<() => void>();

function readStored(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function current(): Theme {
  return readStored() ?? systemTheme();
}

function apply(theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.accent = APP_ACCENT;
  root.style.colorScheme = theme;
}

// Run once at import so the first paint already has the right theme.
if (typeof document !== "undefined") {
  apply(current());
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (!readStored()) {
      apply(systemTheme());
      listeners.forEach((l) => l());
    }
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Current theme (stored choice, else prefers-color-scheme) and a setter that persists it. */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, current, () => "light" as Theme);

  useEffect(() => apply(theme), [theme]);

  const setTheme = useCallback((next: Theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private mode: theme still applies for this page view */
    }
    apply(next);
    listeners.forEach((l) => l());
  }, []);

  return { theme, setTheme };
}
