---
name: build-extension
description: >-
  Builds and packages the OpenSource Partner Support browser extension for
  Firefox (MV2 XPI) and/or Chrome (MV3 zip). Runs tests, compiles shared
  TypeScript, merges manifests, strips content-script exports, and writes
  artifacts. Use when the user asks to build, package, create an XPI, Chrome
  zip, dist-firefox, dist-chrome, bump version, or prepare a store upload.
---

# Build extension

Repo root: `c:\allmystuff\Arbeit\referral-link-inserter`

## Checklist

```
Progress:
- [ ] Install deps if node_modules missing
- [ ] Bump version only if user asked (src/manifest.shared.json)
- [ ] npm test
- [ ] Build requested target(s)
- [ ] Package if user wants artifacts
- [ ] Verify dist / artifacts contents
```

## Steps

1. `cd` to the extension repo. If `node_modules` is missing: `npm ci` (or `npm install`).
2. **Version**: bump `version` in `src/manifest.shared.json` only when the user asks.
3. **Test**: `npm test` — fix failures before packaging.
4. **Build**:
   - Firefox: `npm run build:firefox` → `dist-firefox/`
   - Chrome: `npm run build:chrome` → `dist-chrome/`
   - Both: `npm run build`
5. **Package** (optional):
   - `npm run package:firefox` → `artifacts/*-<version>.xpi`
   - `npm run package:chrome` → `artifacts/*-<version>-chrome.zip`
6. **Verify**:
   - `dist-*/manifest.json` has expected `manifest_version` (2 Firefox / 3 Chrome)
   - `background.js`, `content-script.js`, icons, brand assets present
   - Content script has **no** trailing `export {}`
   - No affiliate IDs in dist (hosts/labels/param names only)

## Load unpacked

See [BUILD.md](../../../BUILD.md): Firefox `about:debugging` → `dist-firefox/manifest.json`; Chrome `chrome://extensions` → Load unpacked → `dist-chrome/`.

## Notes

- Shared source under `src/`; browser differences only in `manifest.*.json` + build script.
- Do not commit unless the user asks.
