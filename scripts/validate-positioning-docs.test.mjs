import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (relativePath) => readFileSync(resolve(root, relativePath), 'utf8');
const withoutQuoteMarkers = (document) => document.replace(/^>\s?/gmu, '');

const rootReadme = read('README.md');
const roadmap = read('ROADMAP.md');
const executionIndex = JSON.parse(read('docs/execution/index.json'));
const executionStatus = read('docs/execution/STATUS.md');
const gtmPlan = read('docs/execution/plans/GTM-001-vibecoder-pilots.md');
const labsPlan = read('docs/execution/plans/LABS-001-rendered-evidence-benchmark.md');
const releasePlan = read('docs/execution/plans/REL-001-public-release-boundary.md');
const packageReadme = read('packages/slopbrick/README.md');
const packageRoadmap = read('packages/slopbrick/ROADMAP.md');
const packageExamples = read('packages/slopbrick/EXAMPLES.md');
const mcpDocs = read('packages/slopbrick/docs/MCP.md');
const websiteHero = read('packages/website/src/components/Hero.astro');
const websiteTools = read('packages/website/src/components/Tools.astro');
const websiteTrust = read('packages/website/src/components/TrustStrip.astro');
const websiteCta = read('packages/website/src/components/CTASection.astro');
const websiteDocs = read('packages/website/src/pages/docs/index.astro');
const marketResearch = read('docs/research/usebrick-market-positioning-2026-07-19.md');

test('binds durable strategy to one UseBrick product and a shipped SlopBrick front door', () => {
  assert.match(
    withoutQuoteMarkers(roadmap),
    /UseBrick is the coherence and verification layer for agent-built\s+software/,
  );
  assert.match(rootReadme, /UseBrick is the sole customer-facing product/);
  assert.match(packageReadme, /SlopBrick is the shipped scanner and CLI/);
  assert.match(packageRoadmap, /root \[UseBrick roadmap\]\(\.\.\/\.\.\/ROADMAP\.md\)/);
  assert.match(packageRoadmap, /no longer acts as a planning authority/);
});

test('keeps external validation ready, empty, and non-authorizing', () => {
  const gtm = executionIndex.plans.find(({ id }) => id === 'GTM-001');
  assert.ok(gtm, 'GTM-001 must remain indexed');
  assert.equal(gtm.status, 'ready');
  assert.equal(gtm.horizon, 'now');
  assert.equal(gtm.track, 'company');
  assert.match(gtmPlan, /10[–-]20 observed sessions/);
  assert.match(gtmPlan, /Completed sessions:\*\* 0/);
  assert.match(gtmPlan, /Outreach authorized:\*\*\s*`false`/i);
  assert.match(gtmPlan, /do not contact or schedule anyone/i);
  assert.match(executionStatus, /Company \| 0 \| 1/);
});

test('keeps rendered evidence in a benchmark-only Labs boundary', () => {
  const labs = executionIndex.plans.find(({ id }) => id === 'LABS-001');
  assert.ok(labs, 'LABS-001 must be indexed');
  assert.equal(labs.status, 'draft');
  assert.equal(labs.lane, 'labs');
  assert.match(labsPlan, /benchmark-only capability name/i);
  assert.match(labsPlan, /No browser product,\s*standalone package, Chromium fork/i);
  assert.match(labsPlan, /decision is `stop`/);
});

test('keeps customer copy on capabilities rather than separately shipped products', () => {
  assert.match(websiteHero, /Your agents can write code/);
  assert.match(websiteHero, /UseBrick keeps the system coherent/);
  assert.match(websiteTools, /capabilities, not separate products/);
  assert.match(websiteTools, /Render Labs/);
  assert.match(websiteTools, /VERIFY RUNTIME · LABS/);
  assert.match(websiteTools, /Paid enforcement does not ship today/);
});

test('keeps current commands on the real slopbrick binary', () => {
  const currentCommandDocs = [
    packageReadme,
    packageExamples,
    mcpDocs,
    websiteHero,
    websiteCta,
    websiteDocs,
  ].join('\n');
  assert.doesNotMatch(
    currentCommandDocs,
    /\busebrick\s+(?:scan|init|ci|mcp|explain|baseline|check|fix|runtime)\b/i,
  );
  assert.match(currentCommandDocs, /npm install -g slopbrick/);
  assert.match(currentCommandDocs, /\bslopbrick scan\b/);
});

test('distinguishes repository-local history from outbound reporting', () => {
  assert.match(websiteTrust, /local scan history on by default/i);
  assert.match(websiteTrust, /outbound reporting off by default and endpoint-gated/i);
  assert.match(packageReadme, /Repository-local scan history and opt-in outbound usage reporting/);
  assert.match(rootReadme, /Do not describe the current CLI as having “no telemetry” or “no network”/);
  assert.doesNotMatch([packageReadme, websiteTrust, websiteCta].join('\n'), /\bno telemetry\b/i);
});

test('isolates volatile market arithmetic in the dated research note', () => {
  assert.match(marketResearch, /scenario, not a forecast/i);
  assert.match(marketResearch, /approximately \$6\.1B–\$10\.2B annual spend proxy/);
  assert.match(marketResearch, /250,000 \| \$30/);
  assert.match(marketResearch, /Cursor had surpassed \$2 billion in annualized\s+revenue/);
  assert.match(marketResearch, /Lovable said it had surpassed \$500 million in annualized revenue/);

  const durableDocs = [
    rootReadme,
    roadmap,
    packageReadme,
    websiteHero,
    websiteTools,
    websiteCta,
  ].join('\n');
  assert.doesNotMatch(
    durableDocs,
    /38\.4m|38\.4 million|\$6\.1B|\$10\.2B|\$352M|\$1\.17B|Cursor.*\$2 billion|Lovable.*\$500 million/i,
  );
});

test('preserves the separate release and deployment authority', () => {
  const release = executionIndex.plans.find(({ id }) => id === 'REL-001');
  assert.ok(release, 'REL-001 must remain indexed');
  assert.equal(release.status, 'waiting_external');
  assert.match(
    releasePlan,
    /website-source changes do not alter\s+either public artifact and are not publication or deployment authority/i,
  );
  assert.match(
    releasePlan,
    /keep npm publication and\s+website deployment unauthorized/i,
  );
});
