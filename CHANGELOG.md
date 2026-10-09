# Change Log

## 0.0.25 - 2026-10-09

- Opt into SQLTools 0.28.43's per-connection, persistent schema/table catalogs, local abbreviated matching, and background/manual refresh.
- Load complete columns on demand without the normal 100-column limit and honor table schema context. Multiple referenced tables are looked up separately with bounded concurrency in SQLTools.

## 0.0.24 - 2026-10-09

- Add logical table DDL generation with parameterized, unpaged catalog reads, deterministic SQL rendering, constraints, standalone regular indexes, and table-level grants.
- Reject incomplete or unsupported catalog definitions instead of returning partial SQL. Identity generation mode and sequence options are preserved; temporal tables, row permissions, column masks, generated-expression, hidden, and row-change timestamp columns are detected and rejected.

## 0.0.23 - 2026-10-07

- Fix column completion for lowercase unquoted schema and table names by normalizing Db2 catalog lookups to uppercase.
- Run catalog-query regression tests with `npm test` (requires Node.js 18 or newer).
