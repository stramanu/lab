# Design

## Context

The domain's DNS is on Cloudflare, with a proxied wildcard record (`*.emanuelestrazzullo.dev`) currently answered by Vercel. There is no specific record for `lab`. The demo is a static Vite build with relative paths (`base: './'`), so it works under any sub-path.

## Decisions

- **Workers static assets rather than Pages.** It is Cloudflare's current recommendation for static sites, and the whole setup lives in one `wrangler.jsonc`: the Custom Domain is declared as a route with `custom_domain: true`, so a single `wrangler deploy` also creates the DNS record. No Worker script is needed. `_redirects` and `_headers` are supported for static assets.
- **Path layout.** `site/systemone/` holds the demo, so future experiments can sit next to it and `/systemone/` stays a stable link. `/` redirects to `/systemone/` with a 302 (temporary, because a lab index may replace it); `/systemone` redirects to `/systemone/` with a 301.
- **Headers.** Hashed build assets (`/systemone/assets/*`) get `Cache-Control: public, max-age=31536000, immutable`. JSON data files and HTML get short caching (`max-age=300`). Everything gets `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` and a restrictive `Permissions-Policy`. No CSP for now: Google Fonts and the Web Worker would need a tuned policy. That is noted as a follow-up.
- **404 handling.** `not_found_handling: "404-page"` with a minimal `404.html` that links to the demo.

## Risks / Trade-offs

- [The Custom Domain cannot be created if a specific record for `lab` already exists] → checked: only the wildcard exists.
- [The wildcard currently sends `lab` to Vercel] → the new specific record overrides it for `lab` only.
