# Playwright QA — Read Reports & Improve Tests

This skill teaches how to read Playwright HTML reports, interpret failures, and improve the E2E test suite based on what went wrong.

## Running Tests

```bash
# Run all E2E tests (headed, slow, with screenshots)
npm run test:e2e

# Run a specific test file
npx playwright test e2e/dashboard-and-import.spec.ts --project=local

# Run tests matching a name pattern
npx playwright test -g "Room edit" --project=local

# Run headless for CI
npm run test:e2e:ci
```

## Viewing the HTML Report

After any test run, open the report:

```bash
npm run test:e2e:report
```

This opens a browser with:
- **Test list** — green/red/yellow for pass/fail/flaky. Click any test to drill in.
- **Timeline** — every Playwright action with its screenshot. Step through like a filmstrip.
- **Traces** — full trace viewer (network, console, DOM snapshots). Click "trace" on any test.
- **Errors** — exact assertion that failed, with the expected vs actual values and a screenshot of the page at failure time.

The report lives at `playwright-report/index.html`.

## Reading a Failure

When a test fails, the report gives you:

1. **Error message** — e.g. `expect(locator).toBeVisible()` timed out. This tells you WHAT failed.
2. **Screenshot at failure** — the page state when the assertion timed out. This tells you WHY — maybe the element isn't there, or it has different text, or a loading spinner is blocking it.
3. **Action log** — every click, fill, navigation that happened before the failure. Trace through to find where the flow diverged from expectations.
4. **Trace viewer** — click "trace" to see network requests, console logs, and DOM snapshots. Look for:
   - **Failed API calls** (red in network tab) — maybe the backend returned an error
   - **Console errors** — React hydration mismatches, runtime exceptions
   - **DOM snapshot** — inspect the actual DOM at any point in the test

## Common Failure Patterns & Fixes

### 1. Element not found / timeout
**Symptom:** `expect(locator).toBeVisible()` times out.
**Diagnosis:** Look at the screenshot. Is the element:
- Not rendered yet? → Add `await page.waitForTimeout()` or wait for a prior element first.
- Hidden behind a loading state? → Wait for the loading indicator to disappear first.
- Text changed? → Update the selector to match current UI text.
- Behind a different URL? → Check if navigation happened as expected.

**Fix pattern:**
```typescript
// Bad: assumes element is immediately there
await expect(page.getByText('Save room')).toBeVisible();

// Better: wait for the container to load first
await expect(page.getByText('Editing room')).toBeVisible();
await expect(page.getByText('Save room')).toBeVisible();
```

### 2. Wrong value after save
**Symptom:** After save + reload, the form shows old values.
**Diagnosis:** Check the trace's network tab. Did the POST to `/api/monthly-payments/rooms` succeed? What was the response?
**Common causes:**
- Auth issue (401) — check that `NEXT_PUBLIC_LOCAL_AUTH_BYPASS=true` is in `.env.local`
- Validation error (400) — check the request body matches what the API expects
- The page didn't actually reload — add `await page.reload()` explicitly

### 3. State machine transitions fail
**Symptom:** After matching a reference, "Sign off" doesn't appear.
**Diagnosis:** The match might have failed silently. Check:
- Network tab for the POST to `/api/monthly-payments/references`
- The response body for error messages
- Whether `router.refresh()` actually re-fetched the data

### 4. Flaky tests (pass sometimes, fail sometimes)
**Diagnosis:** Usually a race condition. The test proceeds before the UI has updated after a mutation.
**Fix:** Add explicit waits after mutations:
```typescript
await page.getByText('Save room').click();
await expect(page.getByText('Editing room')).toBeHidden({ timeout: 15_000 });
await page.waitForTimeout(1000); // let router.refresh() settle
await page.reload(); // force a fresh server render
```

### 5. Selector matches multiple elements
**Symptom:** `strict mode violation` — locator resolved to multiple elements.
**Fix:** Be more specific:
```typescript
// Bad: matches multiple "Rent" labels
page.getByText('Rent')

// Better: scope to a specific section
page.locator('label').filter({ hasText: 'Rent' }).first().locator('input')
```

## Improving Tests After a Failure

Follow this process:

1. **Run the tests** → `npm run test:e2e`
2. **Open the report** → `npm run test:e2e:report`
3. **For each failure:**
   a. Read the error message and screenshot
   b. Open the trace if the cause isn't obvious
   c. Determine: is this a test bug or an app bug?
   d. If test bug: fix the selector, timing, or flow
   e. If app bug: file it, then update the test to skip or handle the known issue
4. **Run again** to verify the fix
5. **Check for new coverage opportunities** — did the failure reveal an untested edge case?

## Extending Coverage

When adding new tests, follow these principles:

- **One long E2E flow per test** — not many tiny tests. Each test should exercise a complete user journey.
- **Verify mutations round-trip** — after saving, reload the page and verify the saved values appear. Re-open the editor and check form values match.
- **Use `test.skip()` for missing data** — don't let tests fail just because the dev database doesn't have the right seed data. Skip gracefully with a message.
- **Restore state after mutations** — if a test edits a room, restore the original values at the end so the next run starts clean.
- **Capture the full flow** — dashboard → locations → room manager → edit → save → verify → navigate back. Not just "click save".

## Test File Structure

```
e2e/
  dashboard-and-import.spec.ts    # Entry → Dashboard → Bank import controls
  rooms-and-navigation.spec.ts    # Room manager CRUD, locations admin, reference pool
  units-and-matching.spec.ts      # Units table, match drawer, sign-off state machine
```

## API Endpoints for Verification

These can be called with `page.request.post()` to verify DB state:

- `POST /api/monthly-payments/rooms` — save room data (property_units + match hints)
- `POST /api/monthly-payments/references` — match/sign_off/reverse_sign_off

## Config Reference

Key settings in `playwright.config.ts`:
- `slowMo: 2500` — 2.5s delay between each action (local only)
- `screenshot: 'on'` — captures every action for the HTML report
- `trace: 'on'` — full trace recording for the trace viewer
- `timeout: 60_000` — 60s per test
- `actionTimeout: 15_000` — 15s per individual action
- `workers: 1` — sequential execution
