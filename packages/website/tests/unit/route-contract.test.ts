import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

describe('website route contract', () => {
  it('emits a route-specific canonical URL and Open Graph URL', () => {
    const base = read('src/layouts/Base.astro');

    expect(base).toContain('canonicalPath?: string');
    expect(base).toContain('rel="canonical"');
    expect(base).toContain('href={canonicalUrl}');
    expect(base).toContain('content={canonicalUrl}');
  });

  it('assigns stable canonical paths to secondary pages and the 404 page', () => {
    expect(read('src/pages/docs/index.astro')).toContain('canonicalPath="/docs"');
    expect(read('src/pages/changelog/index.astro')).toContain('canonicalPath="/changelog"');
    expect(read('src/pages/404.astro')).toContain('canonicalPath="/404"');
  });

  it('ships the canonical route artifacts and sitemap entries', () => {
    const sitemap = read('public/sitemap.xml');
    const robots = read('public/robots.txt');

    for (const route of [
      'src/pages/index.astro',
      'src/pages/docs/index.astro',
      'src/pages/changelog/index.astro',
      'src/pages/404.astro',
    ]) {
      expect(read(route)).toContain('<main id="top"');
    }

    expect(robots).toContain('Sitemap: https://usebrick.dev/sitemap.xml');
    expect(sitemap).toContain('<loc>https://usebrick.dev/</loc>');
    expect(sitemap).toContain('<loc>https://usebrick.dev/docs</loc>');
    expect(sitemap).toContain('<loc>https://usebrick.dev/changelog</loc>');
  });
});
