<!-- GENERATED FILE: pnpm generate:language-matrix. Do not edit manually. -->
# Language support matrix

This matrix is the release-facing contract for file discovery, parsing, rule execution, fixtures, and calibration scope. “Supported” means a file is discovered and scanned; it does **not** imply a complete language AST or a calibrated AI-authorship signal. Current v10.3 admission is zero; historical eligibility wording is not current release evidence.

| Language | Extensions | Parser / facts path | Rules executed | Defaults | Fixtures | Calibration eligibility |
|---|---|---|---|---|---|---|
| TypeScript / JavaScript | .ts, .tsx, .js, .jsx, .vue, .svelte, .astro, .html | SWC for JS/TS + dedicated Vue/Svelte/Astro/HTML adapters | Shared registry; framework and generic rules | Mixed (see rule catalog) | tests/rules/**; framework fixtures | Historical/research cohorts vary; current v10.3 has zero admitted units |
| Python | .py | Blank module + source-preserving facts | Shared regex/AI/security rules; Python MCP pattern visitor | No Python-specific scan rules | tests/engine/visitors/python.test.ts | Research-only unless cohort is declared |
| Go | .go | Blank module + source-preserving facts | go/* plus shared regex/AI/security rules | go/* default-off (DORMANT) | tests/engine/visitors/go.test.ts; tests/rules/go | Research-only; current go/* cohort is dormant |
| Rust | .rs | Blank module + tree-sitter Rust visitor | rust/* plus shared rules | rust/* default-on (USEFUL/OK) | tests/engine/rust-visitor.test.ts; tests/rules/rust | Historical v10 cohort only; current v10.3 has zero admitted units |
| Dart | .dart | Blank module + source-preserving facts | dart/* plus shared source-text rules; Dart MCP pattern visitor | All dart/* default-off (DORMANT) | tests/engine/visitors/dart.test.ts; tests/rules/dart | Not eligible for release claims; historical research only and current v10.3 has zero admitted units |
| Ruby | .rb | Blank module + source-preserving facts | rb/* plus shared source-text rules; Ruby MCP patterns | All rb/* default-off (DORMANT) | tests/rules/rb | Not eligible; corpus calibration pending |
| PHP | .php | Blank module + source-preserving facts | php/* plus shared source-text rules; PHP MCP patterns | All php/* default-off (DORMANT) | tests/rules/php | Not eligible; corpus calibration pending |
| C# | .cs | Blank module + source-preserving facts | cs/* source-text rules | All cs/* default-off (DORMANT) | tests/engine/csharp-routing.test.ts; tests/rules/cs | Not eligible; corpus calibration pending |
| Java | .java | Blank module + source-preserving facts | java/* plus shared source-text rules | Mixed; Java-specific calibration is historical | tests/rules/java | Research-only unless cohort is declared |
| Kotlin | .kt, .kts | Blank module + source-preserving facts | kt/* plus shared source-text rules | kt/* default-off (DORMANT) | tests/rules/kt | Research-only; current kt/* cohort is dormant |
| Swift | .swift | Blank module + source-preserving facts | swift/* plus shared source-text rules | swift/* default-off (mostly DORMANT) | tests/rules/swift | Research-only; cohort below release evidence bar |
| C / C++ | .c, .h, .cc, .cpp, .cxx, .hpp, .hxx | Blank module + source-preserving facts | cpp/* plus shared source-text rules | cpp/* default-on (HYGIENE/OK) | tests/rules/cpp | Historical hygiene analysis only; current v10.3 has zero admitted units |

## Interpretation

- Generic source-text rules can run on parserless files when parsing yields a blank module with the original source preserved.
- A default-off/DORMANT language rule is available for explicit opt-in, but must not be presented as calibrated release evidence.
- Rust is the only non-JS language in this table with a tree-sitter visitor in the scan path. MCP pattern visitors are separate from scan-rule parsing.
- The matrix intentionally separates discovery and execution from calibration eligibility; adding an extension must not silently expand public claims.
- Current v10.3 admission is zero. Historical cohorts remain useful research evidence but do not qualify the v0.45.0 candidate.

Regenerate and check drift with `pnpm --filter slopbrick generate:language-matrix` and `pnpm --filter slopbrick exec node --import tsx scripts/generate-language-support-matrix.ts --check`.
