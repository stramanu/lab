# Tasks

## 1. Site build

- [x] 1.1 Add `deploy/_redirects`, `deploy/_headers`, `deploy/404.html` and `scripts/build-site.ts` (`pnpm site:build`), and git-ignore `site/` and `.wrangler/`; verify `site/systemone/index.html`, `site/_redirects`, `site/_headers` and `site/404.html` exist after the build
- [x] 1.2 Add `wrangler.jsonc` (assets-only Worker, `site/` directory, 404-page handling, Custom Domain `lab.emanuelestrazzullo.dev`) and `pnpm site:deploy`; verify with `wrangler deploy --dry-run` and a local `wrangler dev` check that `/` redirects to `/systemone/` and the demo loads

## 2. Deploy

- [x] 2.1 After the account owner runs `wrangler login`, run `pnpm site:deploy`; verify `https://lab.emanuelestrazzullo.dev/` redirects to `/systemone/`, the page, worker, three.js chunk and data files load, and there are no console errors
- [x] 2.2 Add a deployment section to the README; run `openspec validate add-cloudflare-deploy --strict`
