import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";

/**
 * Centered auth layout. Drop Wasp's <LoginForm /> / <SignupForm /> (from "wasp/client/auth")
 * into `children` once auth is enabled in main.wasp.ts.
 */
export function AuthCard({ title, description, children, footer }: { title: string; description: string; children: ReactNode; footer: ReactNode }) {
  return (
    <AppShell variant="focus">
      <div className="mx-auto flex max-w-md flex-col py-6 sm:py-12">
        <div className="rounded-(--radius-surface) border border-border bg-surface p-6 shadow-(--shadow-raised) sm:p-8">
          <h1 className="text-2xl text-foreground">{title}</h1>
          <p className="mt-1.5 text-sm text-subtle">{description}</p>
          <div className="mt-6">{children}</div>
        </div>
        <p className="mt-6 text-center text-sm text-subtle">{footer}</p>
      </div>
    </AppShell>
  );
}

/** Visible stand-in for the Wasp auth form. Delete when the real form is dropped in. */
export function AuthFormSlot({ form }: { form: "LoginForm" | "SignupForm" }) {
  return (
    <div
      data-placeholder="wasp-auth-form"
      className="grid min-h-56 place-items-center rounded-(--radius-control) border-2 border-dashed bg-surface-muted p-6 text-center"
      style={{ borderColor: "var(--border-strong)" }}
    >
      <div>
        <p className="text-sm font-medium text-foreground">Auth form goes here</p>
        <p className="mt-1 text-xs text-subtle">
          Replace this with <code className="rounded bg-background px-1 py-0.5 text-[11px]">{`<${form} />`}</code> from{" "}
          <code className="rounded bg-background px-1 py-0.5 text-[11px]">wasp/client/auth</code>
        </p>
      </div>
    </div>
  );
}
