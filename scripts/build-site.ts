/**
 * Assembles the deployable site in site/: the demo under site/systemone/ plus
 * the Cloudflare static-asset files (_redirects, _headers, 404.html) from deploy/.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const out = 'site';
rmSync(out, { recursive: true, force: true });
execFileSync('pnpm', ['exec', 'vite', 'build', '--outDir', join('..', out, 'systemone'), '--emptyOutDir'], { stdio: 'inherit' });
mkdirSync(out, { recursive: true });
for (const f of ['_redirects', '_headers', '404.html']) copyFileSync(join('deploy', f), join(out, f));
console.log(`Site ready in ${out}/`);
