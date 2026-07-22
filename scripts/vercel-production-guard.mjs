export function getVercelProductionGuardFailure(environment) {
  const isVercelProduction =
    environment.VERCEL === "1" && environment.VERCEL_ENV === "production";

  if (!isVercelProduction) {
    return null;
  }

  const gitRef = environment.VERCEL_GIT_COMMIT_REF;

  if (gitRef === "main") {
    return null;
  }

  return [
    "Blocked unsafe Vercel production deployment.",
    `Expected VERCEL_GIT_COMMIT_REF=main, received ${gitRef || "<missing>"}.`,
    "Merge the reviewed branch into main and let the GitHub integration deploy it.",
  ].join("\n");
}
