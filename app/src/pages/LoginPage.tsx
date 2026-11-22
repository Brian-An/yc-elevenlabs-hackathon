import { Link } from "wasp/client/router";
import { LoginForm } from "wasp/client/auth";
import { AuthCard } from "@/components/AuthCard";

export function LoginPage() {
  return (
    <AuthCard
      title="Welcome back"
      description="Log in to pick up where your last date left off."
      footer={
        <>
          New here?{" "}
          <Link to="/signup" className="font-medium text-foreground underline-offset-4 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <LoginForm />
    </AuthCard>
  );
}
