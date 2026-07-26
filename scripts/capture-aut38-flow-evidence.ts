import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const origin = process.env.AUT38_BROWSER_ORIGIN || 'http://127.0.0.1:3012';
const outputDirectory = 'docs/validation/screenshots/2026-07-26-aut38-free-text-flow';
const transcriptPath = 'docs/validation/aut38-free-text-flow-transcript-2026-07-26.json';

const scenarios = [
  { message: 'Hi', screenshot: '01-greeting.png' },
  { message: 'Where are the units?', screenshot: '02-free-text-locations.png' },
  { message: 'Quarry Heights', screenshot: '03-selected-property.png' },
  { message: 'Does it have parking?', screenshot: '04-property-follow-up.png' },
  { message: 'Do you have anything in other locations?', screenshot: '05-other-locations.png' },
];

async function main() {
  await mkdir(outputDirectory, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(origin, { waitUntil: 'networkidle' });
  const hasContent = await page.locator('body').innerText();
  if (!hasContent.trim()) throw new Error('AUT-38 harness rendered a blank page.');
  if (await page.locator('[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay').count()) {
    throw new Error('AUT-38 harness rendered an error overlay.');
  }

  const transcript: Array<{
    customer: string;
    assistant: string;
    status: string;
  }> = [];

  for (const scenario of scenarios) {
    const previousAssistantCount = await page.locator('#interactive-messages .assistant').count();
    await page.locator('#interactive-input').fill(scenario.message);
    await page.locator('#interactive-form button[type="submit"]').click();
    await page.waitForFunction(
      (count) => document.querySelectorAll('#interactive-messages .assistant').length > count,
      previousAssistantCount
    );

    const assistant = await page.locator('#interactive-messages .assistant').last().innerText();
    const status = await page.locator('#interactive-status').innerText();
    transcript.push({ customer: scenario.message, assistant, status });
    await page.getByRole('region', { name: 'Interactive WhatsApp session' }).screenshot({
      path: `${outputDirectory}/${scenario.screenshot}`,
    });
  }

  await writeFile(
    transcriptPath,
    `${JSON.stringify({
      capturedAt: new Date().toISOString(),
      origin,
      mode: 'local deterministic flow; verified property fallback when no OpenAI API key is configured',
      scenarios: transcript,
      browserChecks: {
        hasContent: true,
        errorOverlay: false,
        consoleErrors,
        pageErrors,
      },
    }, null, 2)}\n`
  );

  await browser.close();

  if (consoleErrors.length || pageErrors.length) {
    throw new Error(`Browser errors detected: ${[...consoleErrors, ...pageErrors].join(' | ')}`);
  }

  console.log(JSON.stringify({
    screenshots: scenarios.map((scenario) => `${outputDirectory}/${scenario.screenshot}`),
    transcript: transcriptPath,
    browserChecks: 'passed',
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
