import { useEffect } from "react";
import { useNavigate } from "react-router";
import { getProfile, useQuery } from "wasp/client/operations";
import { routes } from "wasp/client/router";
import { getUserId } from "./userId";

/** Sends someone who has not finished or skipped onboarding to the first-run flow. */
export function useFirstRunRedirect() {
  const navigate = useNavigate();
  const profile = useQuery(getProfile, { userId: getUserId() });
  const firstRun = profile.data !== undefined && profile.data.onboardedAt === null;
  useEffect(() => {
    if (firstRun) navigate(routes.OnboardingRoute.build(), { replace: true });
  }, [firstRun, navigate]);
}
