import assert from "node:assert/strict";
import test from "node:test";

import { getVercelProductionGuardFailure } from "./vercel-production-guard.mjs";

test("allows local and preview builds", () => {
  assert.equal(getVercelProductionGuardFailure({}), null);
  assert.equal(
    getVercelProductionGuardFailure({
      VERCEL: "1",
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "feature/example",
    }),
    null,
  );
});

test("allows Vercel production builds from main", () => {
  assert.equal(
    getVercelProductionGuardFailure({
      VERCEL: "1",
      VERCEL_ENV: "production",
      VERCEL_GIT_COMMIT_REF: "main",
    }),
    null,
  );
});

test("blocks Vercel production builds from feature or unknown refs", () => {
  assert.match(
    getVercelProductionGuardFailure({
      VERCEL: "1",
      VERCEL_ENV: "production",
      VERCEL_GIT_COMMIT_REF: "feature/meta-channel-infrastructure",
    }),
    /Blocked unsafe Vercel production deployment/,
  );
  assert.match(
    getVercelProductionGuardFailure({
      VERCEL: "1",
      VERCEL_ENV: "production",
    }),
    /received <missing>/,
  );
});
