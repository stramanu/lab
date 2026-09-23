# Proposal

## Why

The demo has to be public, on the author's own domain, so it can be linked from LinkedIn and GitHub. The domain `emanuelestrazzullo.dev` is on Cloudflare. The user chose `lab.emanuelestrazzullo.dev`, a home for this and future experiments, and deployment with Wrangler from their machine.

## What Changes

- A Cloudflare Worker with static assets only (no Worker code), served on the Custom Domain `lab.emanuelestrazzullo.dev`.
- The demo lives at a stable path, `lab.emanuelestrazzullo.dev/systemone/`. The root redirects there until a lab index exists.
- `pnpm site:build` assembles `site/`: the demo built into `site/systemone/`, plus `_redirects`, `_headers` (long cache for hashed assets, basic security headers) and a small 404 page.
- `pnpm site:deploy` builds the site and runs `wrangler deploy`; `wrangler` is a pinned dev dependency.
- README: deployment section.

No spec-level behavior changes: the page is the same static site. The change sets `skip_specs: true`.

## Capabilities

### New Capabilities
<!-- None. -->

### Modified Capabilities
<!-- None. -->

## Impact

- New `wrangler.jsonc`, `deploy/` (redirects, headers, 404 page), `scripts/build-site.ts`; package scripts `site:build` and `site:deploy`; `site/` and `.wrangler/` git-ignored.
- DNS: deploying creates a record for `lab` that takes precedence over the existing wildcard record for that hostname only. Other subdomains are unaffected.
- Requires a one-time `wrangler login` by the account owner.
