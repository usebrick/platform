import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

const heroSource = read('src/components/Hero.astro');
const toolsSource = read('src/components/Tools.astro');
const compareSource = read('src/components/Compare.astro');
const calibrationSource = read('src/components/Calibration.astro');
const ctaSource = read('src/components/CTASection.astro');
const docsSource = read('src/pages/docs/index.astro');
const homeSource = [
  read('src/layouts/Base.astro'),
  heroSource,
  toolsSource,
  compareSource,
  read('src/components/TrustStrip.astro'),
  calibrationSource,
  ctaSource,
].join('\n');

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

  it('positions UseBrick as the coherence product while keeping SlopBrick as the current CLI', () => {
    expect(homeSource).toContain('UseBrick coherence and verification');
    expect(homeSource).toContain('Your agents can write code');
    expect(homeSource).toContain('UseBrick keeps the system coherent');
    expect(heroSource).toContain(
      'One repository-owned contract shared by developers, coding agents, and CI.',
    );
    expect(heroSource).toContain('npm install -g slopbrick');
    expect(heroSource).toContain('SlopBrick is the shipped local scanner and current CLI.');
    expect(homeSource).not.toContain('free front door for vibecoders');
    expect(homeSource).not.toContain('first paid team layer');
    expect(homeSource).not.toMatch(/\busebrick (scan|init|ci|mcp)\b/);
  });

  it('presents one truthful capability loop with explicit status labels', () => {
    expect(toolsSource).toContain('capabilities, not separate products');
    expect(toolsSource).toContain('Render Labs');
    expect(toolsSource).toContain('Observe');
    expect(toolsSource).toContain('Preserve intent');
    expect(toolsSource).toContain('Compile context');
    expect(toolsSource).toContain('Prevent drift');
    expect(toolsSource).toContain('Repair');
    expect(toolsSource).toContain('Verify runtime');
    for (const status of ['SHIPPED', 'PLANNED', 'PARKED', 'LABS']) {
      expect(toolsSource).toContain(status);
    }
  });

  it('keeps comparison, calibration, CTA, and docs claims inside verified boundaries', () => {
    const productFacts = JSON.parse(read('src/data/product-facts.json')) as {
      corpusLabel?: string;
    };

    expect(compareSource).toContain('shared repository truth');
    expect(compareSource).toContain('new-debt protection');
    expect(compareSource).toContain('cross-agent evidence');
    expect(calibrationSource).toContain('Historical');
    expect(productFacts.corpusLabel).toBe('v10.1');
    expect(calibrationSource).toContain('productFacts.corpusLabel');
    expect(calibrationSource).toContain('v10.3 admission');
    expect(ctaSource).toContain('npm install -g slopbrick');
    expect(ctaSource).toContain('SlopBrick is the shipped local scanner and current CLI.');
    expect(docsSource).toContain('UseBrick is the coherence and verification layer');
    expect(docsSource).toContain('SlopBrick is the shipped local scanner and current CLI.');
    expect(docsSource).toContain('slopbrick scan');
    expect(homeSource).not.toMatch(/38\.4m|\$6\.1B|Gartner|JetBrains adoption/);
  });

  it('preserves spaces across dynamic product-fact boundaries', () => {
    expect(docsSource).toContain(
      "{productFacts.published.ruleCount}{' '}\n          rules",
    );
    expect(docsSource).toContain("rules in{' '}\n          {productFacts.categoryCount}");
    expect(compareSource).toContain("{productFacts.ruleCount}{' '}\n      rules across");
    expect(calibrationSource).toContain(
      "from{' '}\n      {productFacts.corpusAnalyzedFiles.toLocaleString()}",
    );
    expect(calibrationSource).toContain(
      "{productFacts.unmeasuredRuleCount}{' '}\n      workspace rules",
    );
    expect(ctaSource).toContain("{productFacts.published.ruleCount}{' '}\n      rules in");
  });

  it('marks the lifecycle narrative as historical and defers current authority', () => {
    const lifecycle = read('docs/blog/lifecycle-narrative.md');

    expect(lifecycle).toContain('Historical article (2026-07-01)');
    expect(lifecycle).toContain('capabilities, not separate products');
    expect(lifecycle).toContain('../../../../ROADMAP.md');
    expect(lifecycle).toContain('../../../../docs/execution/index.json');
    expect(lifecycle).not.toContain('Each stage has a dedicated product');
    expect(lifecycle).not.toContain('## The four products');
  });
});
