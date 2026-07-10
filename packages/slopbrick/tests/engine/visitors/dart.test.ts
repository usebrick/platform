import { describe, expect, it } from 'vitest';
import { extractDartPatterns } from '../../../src/engine/visitors/dart';

describe('Dart pattern visitor', () => {
  it('extracts Aqueduct/Conduit router.route registrations', () => {
    const result = extractDartPatterns(
      '/tmp/routes.dart',
      "router.route('/users');\nrouter.get('/health', handler);",
    );

    expect(result.route.map((pattern) => pattern.name)).toEqual(['/users', '/health']);
  });
});
