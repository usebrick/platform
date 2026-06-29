// Inventory-first pattern extractor for Ruby source files.
//
// Pure functions that feed into `buildPatternInventory` (see
// `src/mcp/patterns.ts`). The lens: "did this code introduce a new
// pattern when an existing pattern already existed?" — so a file
// containing `class UserService` registers a service named "User"
// that the cross-file drift detector can later compare against
// `UserManager`, `UserRepository`, etc.
//
// v0.14.0 — regex-only, no Ruby parser dependency. Each call returns
// AT MOST one `PatternMatch` per category per file. The `imports`
// array is left empty — a later pass will populate it from the
// visitor's import graph.

import type { PatternMatch } from '../../mcp/patterns.js';

/** Shape of a single extractor's output. */
export interface RubyPatternResult {
  service: PatternMatch[];
  route: PatternMatch[];
  ormModel: PatternMatch[];
}

/**
 * Canonical service-layer suffixes we strip from the captured class
 * name to derive the base pattern. Order is irrelevant — the regex
 * already consumes the longest matching suffix; we just sanitize the
 * result defensively in case the name contains additional suffixes.
 */
const SERVICE_SUFFIXES = [
  'Service',
  'Manager',
  'Handler',
  'Repository',
  'Controller',
  'Helper',
  'Factory',
  'Provider',
  'Store',
  'API',
  'Client',
  'Adapter',
  'Resolver',
  'Mapper',
  'Transformer',
  'Serializer',
  'Validator',
  'Strategy',
  'Facade',
  'Decorator',
  'Observer',
  'Builder',
  'Command',
  'Processor',
  'Worker',
  'Job',
  'Presenter',
  'Policy',
  'Query',
  'Interactor',
  'UseCase',
] as const;

const SERVICE_SUFFIX_GROUP = `(?:${SERVICE_SUFFIXES.join('|')})`;

/**
 * `class X<ServiceSuffix>`. Ruby's only top-level type container is
 * `class` (modules are a different beast). Captures the FULL name
 * (e.g. "UserService"). The cluster strips the suffix to derive the
 * stem, so we don't strip here.
 *
 * The `^` anchor plus the `m` flag restricts matches to
 * start-of-line declarations. Optional `class << self` blocks are
 * skipped (no named service-shape).
 */
const RUBY_SERVICE_RE = new RegExp(
  `^class\\s+(\\w+?)${SERVICE_SUFFIX_GROUP}?\\b`,
  'gm',
);

/**
 * HTTP route registrations for the 3 dominant Ruby web frameworks:
 *
 *   - Rails: `get '/path' => 'controller#action'`, `post '/path' => ...`,
 *     `resources :users`, `namespace :api do ... end`
 *   - Sinatra: `get '/path' do ... end`, `post '/path' do ... end`
 *   - Hanami: `get '/path', to: ...`
 *
 * The `resources` form is captured as the resource name (e.g.
 * `resources :users` → "/users"); the `namespace` form is captured
 * as the namespace path (e.g. `namespace :api` → "/api"). These are
 * normalized by the cluster.
 */
const RUBY_RAILS_ROUTE_RE =
  /^\s*(?:get|post|put|delete|patch|resources|namespace)\s+['":]?(\/[^\s'"]*|[\w]+)['"]?/gm;
const RUBY_SINATRA_ROUTE_RE = /^\s*(?:get|post|put|delete|patch)\s+['"](\/[^'"]+)['"]/gm;

/**
 * Rails ActiveRecord + Mongoid ORM model patterns:
 *
 *   - ActiveRecord: `class X < ApplicationRecord` or `class X < ActiveRecord::Base`
 *   - Mongoid: `class X` with `include Mongoid::Document` somewhere
 *   - Sequel: `class X < Sequel::Model(...)`
 *   - DataMapper (legacy): `class X` with `include DataMapper::Resource`
 */
const RUBY_AR_RE = /^class\s+(\w+)\s*<\s*(?:ApplicationRecord|ActiveRecord::Base|ActiveRecord\Model)\b/gm;
const RUBY_MONGOID_RE = /include\s+Mongoid::Document[\s\S]{0,500}?class\s+(\w+)/g;
const RUBY_SEQUEL_RE = /^class\s+(\w+)\s*<\s*Sequel::Model\b/gm;
const RUBY_DATAMAPPER_RE = /include\s+DataMapper::Resource[\s\S]{0,500}?class\s+(\w+)/g;

export function extractRubyPatterns(
  filePath: string,
  source: string,
): RubyPatternResult {
  const service: PatternMatch[] = [];
  const route: PatternMatch[] = [];
  const ormModel: PatternMatch[] = [];

  const seenService = new Set<string>();
  for (const m of source.matchAll(RUBY_SERVICE_RE)) {
    const name = m[1];
    if (seenService.has(name)) continue;
    seenService.add(name);
    service.push({ name, files: [filePath], imports: [] });
  }

  const seenRoute = new Set<string>();
  for (const m of source.matchAll(RUBY_RAILS_ROUTE_RE)) {
    const name = m[1];
    if (seenRoute.has(name)) continue;
    seenRoute.add(name);
    route.push({ name, files: [filePath], imports: [] });
  }
  for (const m of source.matchAll(RUBY_SINATRA_ROUTE_RE)) {
    const name = m[1];
    if (seenRoute.has(name)) continue;
    seenRoute.add(name);
    route.push({ name, files: [filePath], imports: [] });
  }

  const seenOrm = new Set<string>();
  for (const m of source.matchAll(RUBY_AR_RE)) {
    const name = m[1];
    if (seenOrm.has(name)) continue;
    seenOrm.add(name);
    ormModel.push({ name, files: [filePath], imports: [] });
  }
  for (const m of source.matchAll(RUBY_MONGOID_RE)) {
    const name = m[1];
    if (seenOrm.has(name)) continue;
    seenOrm.add(name);
    ormModel.push({ name, files: [filePath], imports: [] });
  }
  for (const m of source.matchAll(RUBY_SEQUEL_RE)) {
    const name = m[1];
    if (seenOrm.has(name)) continue;
    seenOrm.add(name);
    ormModel.push({ name, files: [filePath], imports: [] });
  }
  for (const m of source.matchAll(RUBY_DATAMAPPER_RE)) {
    const name = m[1];
    if (seenOrm.has(name)) continue;
    seenOrm.add(name);
    ormModel.push({ name, files: [filePath], imports: [] });
  }

  return { service, route, ormModel };
}
