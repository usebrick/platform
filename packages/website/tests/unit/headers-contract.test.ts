import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('static security headers', () => {
  it('keeps scripts self-hosted and forbids ambient document capabilities', () => {
    const headers = readFileSync(resolve(process.cwd(), 'public/_headers'), 'utf8');
    const csp = headers.match(/Content-Security-Policy:\s*(.+)/)?.[1] ?? '';

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain("connect-src 'self'");
    expect(headers).not.toMatch(/Access-Control-Allow-Origin:\s*\*/i);
  });
});
