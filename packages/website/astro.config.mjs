import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  site: 'https://usebrick.dev',
  trailingSlash: 'ignore',
  build: {
    inlineStylesheets: 'auto',
    assets: 'assets',
  },
  vite: {
    ssr: {
      noExternal: ['gsap', 'lenis'],
    },
    server: {
      // Match the dev port to the README's documented URL
      port: 4321,
    },
  },
});
