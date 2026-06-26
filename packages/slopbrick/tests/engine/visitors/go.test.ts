import { describe, it, expect } from 'vitest';
import { extractGoPatterns } from '../../../src/engine/visitors/go';

/**
 * Pattern extractor for Go source files. These tests pin the SPEC
 * contract (one file → three categories of PatternMatch) and guard
 * against the regex regressions that would either miss real
 * patterns or over-match innocent type declarations.
 */
describe('extractGoPatterns', () => {
  it('extracts a type ending in Service as a service pattern', () => {
    const source = `
package main

type UserService struct {
    db *sql.DB
}

func (s *UserService) Get(id int) (*User, error) {
    return nil, nil
}
`;
    const result = extractGoPatterns('/path/to/user_service.go', source);
    expect(result.service).toHaveLength(1);
    expect(result.service[0].name).toBe('User');
    expect(result.service[0].files).toEqual(['/path/to/user_service.go']);
    expect(result.service[0].imports).toEqual([]);
  });

  it('extracts http.HandleFunc route as a route pattern', () => {
    const source = `
package main

import "net/http"

func main() {
    http.HandleFunc("/foo", fooHandler)
}
`;
    const result = extractGoPatterns('/path/to/routes.go', source);
    expect(result.route).toHaveLength(1);
    expect(result.route[0].name).toBe('/foo');
    expect(result.route[0].files).toEqual(['/path/to/routes.go']);
    expect(result.route[0].imports).toEqual([]);
  });

  it('extracts gin router.GET route as a route pattern', () => {
    const source = `
package main

import "github.com/gin-gonic/gin"

func main() {
    router := gin.Default()
    router.GET("/foo", func(c *gin.Context) {
        c.String(200, "ok")
    })
}
`;
    const result = extractGoPatterns('/path/to/server.go', source);
    expect(result.route).toHaveLength(1);
    expect(result.route[0].name).toBe('/foo');
    expect(result.route[0].files).toEqual(['/path/to/server.go']);
  });

  it('extracts a gorm.Model-embedding struct as an ormModel pattern', () => {
    const source = `
package main

import "gorm.io/gorm"

type User struct {
    gorm.Model
    Name string
}
`;
    const result = extractGoPatterns('/path/to/user.go', source);
    expect(result.ormModel).toHaveLength(1);
    expect(result.ormModel[0].name).toBe('User');
    expect(result.ormModel[0].files).toEqual(['/path/to/user.go']);
    expect(result.ormModel[0].imports).toEqual([]);
  });

  it('returns empty arrays for an empty file', () => {
    const result = extractGoPatterns('/path/to/empty.go', '');
    expect(result.service).toEqual([]);
    expect(result.route).toEqual([]);
    expect(result.ormModel).toEqual([]);
  });

  it('extracts multiple distinct patterns of different categories from one file', () => {
    const source = `
package main

import (
    "net/http"
    "gorm.io/gorm"
)

type UserService struct{}
type OrderManager struct{}

func init() {
    http.HandleFunc("/users", usersHandler)
    http.HandleFunc("/orders", ordersHandler)
}

type User struct {
    gorm.Model
    Name string
}
`;
    const result = extractGoPatterns('/path/to/mixed.go', source);
    expect(result.service.map((s) => s.name).sort()).toEqual(['Order', 'User']);
    expect(result.route.map((r) => r.name).sort()).toEqual(['/orders', '/users']);
    expect(result.ormModel).toHaveLength(1);
    expect(result.ormModel[0].name).toBe('User');
    // Every emitted PatternMatch should record the file as its source.
    for (const match of [...result.service, ...result.route, ...result.ormModel]) {
      expect(match.files).toEqual(['/path/to/mixed.go']);
      expect(match.imports).toEqual([]);
    }
  });

  it('strips service suffixes so competing types cluster on the bare name', () => {
    // Three competing patterns for "User" inside one file — the
    // canonical drift case. After suffix stripping they all reduce
    // to the bare domain name, so this file contributes a single
    // entry to the "User" pattern in the project inventory rather
    // than three redundant ones.
    const source = `
package main

type UserService struct{}
type UserManager struct{}
type UserHandler struct{}
`;
    const result = extractGoPatterns('/path/to/users.go', source);
    expect(result.service).toHaveLength(1);
    expect(result.service[0].name).toBe('User');
  });

  it('does not match a struct that does not embed gorm.Model', () => {
    const source = `
package main

type Address struct {
    City string
}
`;
    const result = extractGoPatterns('/path/to/address.go', source);
    // gorm.Model embedding is the ormModel signal; a plain struct
    // without it must not show up as an ormModel.
    expect(result.ormModel).toEqual([]);
  });
});