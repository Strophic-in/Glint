import vercel from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// adapter-vercel symlinks node_modules into its function bundle, which Windows blocks
// unless Developer Mode is on. Local Windows builds still compile and prerender every
// page; only the Vercel packaging step is skipped. Vercel's own builds use the real adapter.
const skipVercelPackaging =
  process.platform === 'win32' && !process.env.VERCEL && process.env.FORCE_VERCEL_ADAPTER !== '1';

/** @type {import('@sveltejs/kit').Adapter} */
const localAdapter = {
  name: 'local-windows (vercel packaging skipped)',
  adapt(builder) {
    builder.log.minor('Skipping Vercel packaging on Windows. Output: .svelte-kit/output (use `pnpm preview`).');
  }
};

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // Pinned so a newer default Node on Vercel's build image can't break the deploy.
    adapter: skipVercelPackaging ? localAdapter : vercel({ runtime: 'nodejs24.x' })
  }
};

export default config;
