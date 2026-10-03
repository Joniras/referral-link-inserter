---
name: deploy-website
description: >-
  Deploys rechnerlotsen.com changes that affect affiliate partners, support
  redirects, or tagging. Runs commit/push on main, preview deploy, then
  production deploy with PIN confirmation on rl-intern. Use when the user says
  deploy website, production deploy, preview deploy, ship affiliate changes, or
  update the live partners feed / support page.
---

# Deploy website (rechnerlotsen.com)

Website repo: `C:\allmystuff\Rechnerlotsen\rechnerlotsen.com`

Affiliate IDs and Amazon `/ref=nosim` rules live **here**, not in the extension.

## Checklist

```
Progress:
- [ ] Changes committed on main (website repo)
- [ ] Pushed to origin/main
- [ ] Preview deploy triggered
- [ ] Preview healthy (not 502)
- [ ] Production deploy triggered
- [ ] User confirmed PIN on rl-intern
- [ ] Production commit / live check
```

## Steps

1. Work in the website repo. Ensure affiliate/support changes are correct:
   - IDs: `src/content/affiliate-partners.json`
   - Tagging: `src/lib/affiliate-partners.ts` (Amazon product paths only get `/ref=nosim`)
2. Commit and **push `main`** (only if the user wants a deploy; ask before commit/push if unclear).
3. Preview:

   ```bash
   ./scripts/trigger-preview-deploy.sh main
   ```

   Needs `DEPLOY_WEBHOOK_SECRET` (often in `.env.local`).
4. Wait until preview finishes. Preview may auto-shut down after ~1h → **502**; re-run preview if cold.
5. Production request:

   ```bash
   ./scripts/trigger-production-deploy.sh
   ```

   Needs `DEPLOY_WEBHOOK_SECRET` and `DEPLOY_TRIGGER_SECRET`.
6. Tell the user to **confirm the PIN popup on rl-intern** (preview host). Deploy does not finish without that.
7. Wait for the production deploy commit and spot-check live URLs (feed + a support redirect).

## Do not

- Put affiliate IDs into the extension repo
- Skip preview and jump straight to ad-hoc production hacks
- Bypass the PIN confirmation step
