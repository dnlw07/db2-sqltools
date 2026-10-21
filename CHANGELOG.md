# Change Log

## 0.0.30 - 2026-10-20

- Grid editing works for results with repeated column names, such as `SELECT NAME, * FROM t`. Repeated columns are shown as `NAME`, `NAME (1)`, and each copy saves to the real `NAME` column.

## 0.0.29 - 2026-10-19

- Grid editing without primary key columns skips LOB/XML columns when locating the row; the save is still rejected unless the remaining columns match exactly one row. A result with no usable column stays read-only.

## 0.0.28 - 2026-10-19

- Grid editing now also works when the executed `SELECT` omits primary key columns: the row is located by all returned columns (still rejected unless exactly one row matches), instead of the result being read-only.

## 0.0.27 - 2026-10-18

- Generate DDL for range-partitioned tables: `CREATE TABLE` gets `PARTITION BY RANGE` with the first data partition, and the remaining partitions are emitted as separate `ALTER TABLE ... ADD PARTITION` statements. Db2 LUW has no subpartitions.

## 0.0.26 - 2026-10-18

- `SQLTools: Generate DDL` now also generates DDL for views (from `SYSCAT.VIEWS`), in addition to tables. Requires SQLTools 0.28.51.

## 0.0.25 - 2026-10-09

- Opt into SQLTools 0.28.43's per-connection, persistent schema/table catalogs, local abbreviated matching, and background/manual refresh.
- Load complete columns on demand without the normal 100-column limit and honor table schema context. Multiple referenced tables are looked up separately with bounded concurrency in SQLTools.

## 0.0.24 - 2026-10-09

- Add logical table DDL generation with parameterized, unpaged catalog reads, deterministic SQL rendering, constraints, standalone regular indexes, and table-level grants.
- Reject incomplete or unsupported catalog definitions instead of returning partial SQL. Identity generation mode and sequence options are preserved; temporal tables, row permissions, column masks, generated-expression, hidden, and row-change timestamp columns are detected and rejected.

## 0.0.23 - 2026-10-07

- Fix column completion for lowercase unquoted schema and table names by normalizing Db2 catalog lookups to uppercase.
- Run catalog-query regression tests with `npm test` (requires Node.js 18 or newer).
