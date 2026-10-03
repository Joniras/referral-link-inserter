# Agent guide — OpenSource Partner Support

Browser extension (Firefox MV2 + Chrome MV3) for opt-in RechnerLotsen partner support. Affiliate IDs live **only** on the website.

## Read first

- **Rules**: `.cursor/rules/*.mdc` (architecture, affiliate IDs, consent/intercept, naming, deploy, packaging)
- **Skills** (project): `.cursor/skills/`
  - `build-extension` — test, build, package Firefox XPI / Chrome zip
  - `deploy-website` — preview → production PIN flow for rechnerlotsen.com
- **Build / load**: [BUILD.md](BUILD.md)

## Quick commands

```bash
npm test
npm run build:firefox    # → dist-firefox/
npm run build:chrome     # → dist-chrome/
npm run package:firefox  # → artifacts/*.xpi
npm run package:chrome   # → artifacts/*-chrome.zip
```

Bump extension version in `src/manifest.shared.json` only.

## Related repo

Website: `C:\allmystuff\Rechnerlotsen\rechnerlotsen.com`  
Affiliate IDs: `src/content/affiliate-partners.json` (website)  
Public feed: `https://rechnerlotsen.com/data/affiliate-partners.json`
