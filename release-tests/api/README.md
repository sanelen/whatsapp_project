# Production API checks

Every successful Production deployment triggers `production-api` in the release workflow. Checkout uses the deployment SHA. Every response must carry that same `x-hamba-revision`; redirects, authentication failures, missing configuration, semantic failures and duration overruns fail the job. The report is an Actions artifact, with route, method, mode, duration and failure reason. Response bodies and tenant data are not logged.

## Provisioning

Generate a dedicated random secret (at least 32 bytes) and store the identical value as Vercel Production sensitive `RELEASE_CHECK_SECRET` and GitHub Actions repository secret `RELEASE_CHECK_SECRET`. Set Vercel `RELEASE_TEST_PROPERTY_ID` to the property used for read-only content/KB checks. The authenticated configuration probe returns that non-secret scope to the runner; `RELEASE_PROPERTY_ID` is an optional explicit override. No personal staff account, Supabase service key, Google token, or Meta secret belongs in Actions. Keep existing provider credentials exclusively in Vercel. Rotate both release-secret copies together.

The release principal is checked independently in proxy and DAL. A 60-second HMAC binds method, full path/query and body hash. A server-side allowlist accepts fixed dry runs, invalid-input validation and specified reads. Real imports, matching mutations, sign-off, rent/credit changes, OAuth exchange, arbitrary chat prompts and outbound sends are denied. Provider probes accept three fixed operations and a non-secret scope read only, and expose neither tokens nor arbitrary signing. Prompt settings redact the provider key for this principal.

`RELEASE_BASE_URL`, `RELEASE_EXPECTED_SHA` and `RELEASE_CHECK_SECRET` are required by the runner. The billing cycle defaults to the current 9th–8th cycle; `RELEASE_BILLING_PERIOD` can select a cycle with representative archived PDF evidence. Absence of suitable evidence fails explicitly. A protected deployment URL must be made available through the project's existing approved automation access; an authentication wall is a failure, not proof of API health.

## Coverage and limits

`coverage.mjs` inventories function, variable and named re-exports for every HTTP method in `src/app/api/**/route.ts`. Missing or stale manifest coverage fails CI. Wildcard exports fail closed. Framework-owned Workflow endpoints are exercised by starting and polling real durable verification workflows.

The manifest covers all application methods. Read cases validate response shape; chat must return READY; KB must use vector retrieval (text fallback fails). The import/reconcile cases must enqueue a real durable job, expose persisted completed source/evidence/matching steps, and finish within 180 seconds. Gmail listing, Drive original SHA-256, PDF reparse, receipt existence and matching-rule evaluation run against real services. Matching is a non-mutating dry run; evidence sampling is bounded to six files. API response budgets are 15–60 seconds, depending on operation.

Meta GET verifies the actual challenge route; POST signs an empty event and checks acknowledgement. Enabled waiting-list Flow verifies a real encrypted ping. Disabled Flow is reported as disabled, not passed. No tenant event, outgoing message or Sheet submission is created. Unused LLM providers are not checked.

Mutation methods use explicit dry-run handling or deliberately invalid input. Their reports state that valid mutation persistence is unverified. This is not a claim of complete financial E2E coverage: transactional writes still require isolated fixtures. The existing browser gate complements these checks; it does not replace authenticated API verification.
