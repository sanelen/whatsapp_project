import { readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';

type PropertyContract = {
  id: string;
  name: string;
  pagePath: string;
  address: string;
  portfolioUrl: string;
  pdfPath: string;
  pdfPages: number;
  carouselSlides?: number;
};

const manifest = JSON.parse(
  readFileSync('release-tests/property-showcase.manifest.json', 'utf8'),
) as {
  homepageHeading: string;
  properties: PropertyContract[];
};

test('deployed homepage exposes the three-location property carousel', async ({ page }, testInfo) => {
  await page.goto('/');

  const showcase = page.getByRole('region', { name: manifest.homepageHeading });
  await expect(showcase).toBeVisible();
  await expect(showcase.locator('article')).toHaveCount(3);

  for (const property of manifest.properties) {
    await expect(showcase.getByRole('heading', { name: property.name, exact: true })).toBeVisible();
    await expect(
      showcase.getByRole('link', { name: `View refreshed ${property.name} advert` }),
    ).toHaveAttribute('href', property.pagePath);
  }

  if (testInfo.project.name === 'mobile') {
    const rail = showcase.locator('.property-showcase-rail');
    const before = await rail.evaluate((element) => element.scrollLeft);
    await showcase.getByRole('button', { name: 'Next property' }).click();
    await expect.poll(() => rail.evaluate((element) => element.scrollLeft)).toBeGreaterThan(before);
  }

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    ),
  ).toBe(true);
});

for (const property of manifest.properties) {
  test(`${property.name} location page and pamphlet are available`, async ({ page, request }) => {
    const response = await page.goto(property.pagePath);
    expect(response?.status()).toBe(200);

    await expect(page.getByRole('heading', { name: 'Rooms to let' })).toBeVisible();
    await expect(page.getByText(property.address, { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'View photos' })).toHaveAttribute(
      'href',
      property.portfolioUrl,
    );
    await expect(page.getByRole('link', { name: 'Full pamphlet PDF' })).toHaveAttribute(
      'href',
      property.pdfPath,
    );
    await expect(page.getByText('Complete 3-page property pamphlet')).toBeVisible();

    const pdfResponse = await request.get(property.pdfPath);
    expect(pdfResponse.status()).toBe(200);
    expect(pdfResponse.headers()['content-type']).toContain('application/pdf');

    const pdf = await PDFDocument.load(await pdfResponse.body());
    expect(pdf.getPageCount()).toBe(property.pdfPages);

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      ),
    ).toBe(true);
  });
}

test('deployed Westrich media carousel exposes and changes all six slides', async ({ page }) => {
  const westrich = manifest.properties.find(({ id }) => id === 'westridge')!;
  const slideCount = westrich.carouselSlides;
  if (!slideCount) throw new Error('Westrich carousel slide count is missing from the release contract');
  await page.goto(westrich.pagePath);

  const carousel = page.getByLabel('Property media carousel');
  await expect(carousel).toBeVisible();
  await expect(carousel.locator('figure')).toHaveCount(slideCount);
  await expect(carousel.getByRole('button', { name: /^Show image/ })).toHaveCount(
    slideCount,
  );

  await carousel.getByRole('button', { name: `Show image ${slideCount}` }).click();
  await expect(
    carousel.getByRole('button', { name: `Show image ${slideCount}` }),
  ).toHaveAttribute('aria-current', 'true');
});
