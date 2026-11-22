import { Link } from "wasp/client/router";
import { SignupForm } from "wasp/client/auth";
import { AuthCard } from "@/components/AuthCard";

export function SignupPage() {
  return (
    <AuthCard
      title="Create your profile"
      description="Takes a minute. Then you'll pick who to go on your first practice date with."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <SignupForm />
    </AuthCard>
  );
}
