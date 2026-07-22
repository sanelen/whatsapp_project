# Property Showcase Release Tests

This directory is intentionally separate from `src` and the normal application E2E suite. It is the independent release contract for the public Hamba property experience.

The release gate has three layers:

1. `contracts/` verifies the expected three-property manifest, public routes, source assets, pamphlet links and carousel definitions before a build.
2. `artifacts/` runs automatically after every `npm run build` and inspects the emitted Next.js HTML plus the actual PDF page counts.
3. `browser/` runs against a deployed URL and proves the homepage carousel, locations, photo links, pamphlet downloads, six-slide Westrich carousel and mobile layout are usable.

Commands:

```bash
npm run test:release:contract
npm run build
RELEASE_BASE_URL=https://hambatrading.co.za npm run test:release:browser
```

Production is separately protected by `scripts/vercel-production-guard.mjs`, which rejects Vercel production builds not sourced from `main`.
