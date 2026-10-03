# Build and load

## Prerequisites

```bash
npm ci   # or npm install
npm test
```

## Firefox (MV2)

```bash
npm run build:firefox
# Load unpacked: about:debugging → This Firefox → Load Temporary Add-on
# Select: dist-firefox/manifest.json
```

Package:

```bash
npm run package:firefox
# → artifacts/opensource-partner-support-<version>.xpi
```

## Chrome / Chromium (MV3)

```bash
npm run build:chrome
# Load unpacked: chrome://extensions → Developer mode → Load unpacked
# Select folder: dist-chrome/
```

Package:

```bash
npm run package:chrome
# → artifacts/opensource-partner-support-<version>-chrome.zip
```

## Both

```bash
npm run build
npm run package
```

## Version bump

Edit `version` in `src/manifest.shared.json`, then rebuild/package.
