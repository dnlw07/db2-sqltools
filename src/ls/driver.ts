import AbstractDriver from "@sqltools/base-driver";
import queries from "./queries";
import { splitStatements, stripLeadingNoise } from "./splitStatements";
import {
  IConnectionDriver,
  MConnectionExplorer,
  NSDatabase,
  ContextValue,
  Arg0,
} from "@sqltools/types";
import { v4 as generateId } from "uuid";
import * as db2 from "ibm_db";
import { Database, Options } from "ibm_db";

// import fakeDbLib from './mylib'; // this is what you should do
// const fakeDbLib = {
//   open: () => Promise.resolve(fakeDbLib),
//   query: (..._args: any[]) => {
//     const nResults = parseInt((Math.random() * 1000).toFixed(0));
//     const nCols = parseInt((Math.random() * 100).toFixed(0));
//     const colNames = [...new Array(nCols)].map((_, index) => `col${index}`);
//     const generateRow = () => {
//       const row = {};
//       colNames.forEach(c => {
//         row[c] = Math.random() * 1000;
//       });
//       return row;
//     }
//     const results = [...new Array(nResults)].map(generateRow);
//     return Promise.resolve([results]);
//   },
//   close: () => Promise.resolve(),
// };

// Statements that produce a result set are run through the async `query` API so
// their rows are fetched. Everything else (DML/DDL/SET/...) is run through
// `prepare` + `executeNonQuery` so we can report the number of affected rows.
const RESULT_SET_KEYWORDS = [
  "SELECT",
  "WITH",
  "VALUES",
  "CALL",
  "DESCRIBE",
  "EXPLAIN",
  "XQUERY",
];

// Returns the leading SQL keyword of a statement, skipping leading whitespace,
// line/block comments and opening parentheses.
function leadingKeyword(sql: string): string {
  const s = stripLeadingNoise(sql);
  const m = s.match(/^\(*\s*([A-Za-z_]+)/);
  return m ? m[1].toUpperCase() : "";
}

// True when a "statement" produced by splitStatements() is nothing but
// comments/whitespace, e.g. a stray line like `-- select * from schema.table;`.
// There is no real SQL in it, so it must never be sent to the database - DB2
// would just error trying to prepare an empty/comment-only statement.
function isCommentOnlyStatement(sql: string): boolean {
  return stripLeadingNoise(sql).trim().length === 0;
}

// Coerces whatever SQLTools hands to query() into a single SQL string. Guards
// against ever receiving an array by joining with real newlines instead of
// the "," that Array.prototype.toString() would silently insert, and
// normalizes CRLF/CR line endings to plain \n so a multi-line script (e.g. a
// CREATE VIEW body) keeps one consistent line-break character all the way
// through to the statement handed to ibm_db, instead of the \r\n/\r mix that
// Windows editors and pasted text commonly introduce.
function normalizeQueryInput(queries: any): string {
  const raw = Array.isArray(queries) ? queries.join("\n") : String(queries);
  return raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

interface IExecResult {
  rows: any[];
  cols?: string[];
  metadata?: any[];
  affected: number | null;
  type: string;
  returnsRows: boolean;
}

interface IPagedResult {
  rows: any[];
  cols: string[];
  metadata?: any[];
  total: number;
  exact: boolean;
}

interface IDb2ResultEdit {
  table: { label: string; schema?: string };
  primaryKey: { [column: string]: any };
  changes: { [column: string]: any };
}

interface IDb2ResultEditResponse {
  success: boolean;
  error?: string;
  failedIndex?: number;
}

export default class Db2Driver
  extends AbstractDriver<Database, Options>
  implements IConnectionDriver
{
  /**
   * If you driver depends on node packages, list it below on `deps` prop.
   * It will be installed automatically on first use of your driver.
   */
  public readonly deps: (typeof AbstractDriver.prototype)["deps"] = [
    {
      type: AbstractDriver.CONSTANTS.DEPENDENCY_PACKAGE,
      name: "ibm_db",
      version: "3.3.0",
    },
  ];

  queries = queries;

  private _totalCache: Map<string, number>;

  /** if you need to require your lib in runtime and then
   * use `this.lib.methodName()` anywhere and vscode will take care of the dependencies
   * to be installed on a cache folder
   **/
  private get lib(): typeof db2 {
    const db = this.requireDep("ibm_db");
    return db;
  }

  public async open() {
    if (this.connection) {
      return this.connection;
    }
    // Open the connection here
    const db = this.credentials.database;
    const hostname = this.credentials.server;
    const port = this.credentials.port;
    const protocol = "TCPIP";
    const username = this.credentials.username;
    const password = this.credentials.password;
    const filepath = this.credentials.file;
    let connectionString = `DATABASE=${db};HOSTNAME=${hostname};PORT=${port};PROTOCOL=${protocol};UID=${username};PWD=${password};`;
    if (filepath && filepath.length !== 0) {
      connectionString += `Security=SSL;SSLServerCertificate=${filepath}`;
    }
    const lib = this.lib;
    const conn: Database = await new Promise((resolve, reject) => {
      lib.open(connectionString, (err, c) => {
        if (err) return reject(err);
        resolve(c);
      });
    });

    // Optional init script run once on connect (e.g. SET CURRENT SCHEMA / PATH).
    const initSql = this.credentials.connectionInitSql;
    if (initSql && String(initSql).trim().length > 0) {
      const initStatements = splitStatements(
        normalizeQueryInput(initSql)
      ).filter((stmt) => !isCommentOnlyStatement(stmt));
      for (const stmt of initStatements) {
        try {
          await this._execStatement(conn, stmt);
        } catch (e) {
          // Drop the half-initialised connection and surface a clear error.
          try {
            conn.closeSync();
          } catch (x) {
            /* ignore */
          }
          throw new Error(
            `Connection init script failed on "${stmt}": ${
              (e && e.message) || e
            }`
          );
        }
      }
    }

    this.connection = Promise.resolve(conn);
    return conn;
  }

  public async close() {
    if (!this.connection) return Promise.resolve();
    const conn = await this.connection;
    this.connection = null;
    await new Promise<void>((resolve, reject) => {
      conn.close((err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  // Executes a single statement asynchronously. Result-set statements are run
  // through `db.queryResult` (so column metadata is available even when zero
  // rows come back); everything else goes through `prepare` +
  // `executeNonQuery` so the affected row count is available.
  private _execStatement(db: Database, query: string): Promise<IExecResult> {
    const type = leadingKeyword(query);
    const returnsRows = RESULT_SET_KEYWORDS.indexOf(type) !== -1;
    const isCreateView =
      type === "CREATE" &&
      /^CREATE\s+(OR\s+REPLACE\s+)?VIEW\b/i.test(stripLeadingNoise(query));

    if (isCreateView) {
      // Diagnostic aid: this is the exact string about to be handed to
      // ibm_db. Check the SQLTools output channel - if the newlines are
      // present here but SYSCAT.VIEWS.TEXT still comes back flattened
      // afterwards, the stripping is happening below this driver (in
      // ibm_db or the DB2 CLI layer), not in this code.
      const newlineCount = (query.match(/\n/g) || []).length;
      this.log.info(
        `Executing CREATE VIEW - ${query.length} chars, ${newlineCount} newline(s):\n${query}`
      );
    }

    return new Promise((resolve, reject) => {
      try {
        if (returnsRows) {
          (db as any).queryResult(query, (err, result) => {
            if (err) return reject(err);
            // Pull column headers from the result metadata so an
            // empty result set still renders its columns.
            let cols: string[] = [];
            let metadata: any[] = [];
            try {
              metadata = result.getColumnMetadataSync() || [];
              if (Array.isArray(metadata)) {
                cols = metadata.map((m) => m.SQL_DESC_NAME || m.SQL_DESC_LABEL || m.name);
              }
            } catch (e) {
              /* metadata unavailable - fall back to row keys later */
            }
            result.fetchAll((err2, rows) => {
              try {
                result.closeSync();
              } catch (e) {
                /* ignore */
              }
              if (err2) return reject(err2);
              resolve({ rows: rows || [], cols, metadata, affected: null, type, returnsRows });
            });
          });
        } else if (isCreateView && typeof (db as any).query === "function") {
          // Experiment: route CREATE VIEW through a single query()
          // call (SQLExecDirect at the CLI level) instead of
          // prepare() + executeNonQuery() (SQLPrepare + SQLExecute)
          // - a genuinely different ibm_db/CLI code path. If
          // SYSCAT.VIEWS.TEXT still comes back flattened through
          // this path too, that rules out SQLPrepare's statement
          // handling specifically and points at ibm_db's native
          // binding, or the DB2 CLI/ODBC driver, more broadly.
          this.log.info(
            "CREATE VIEW: trying db.query() (SQLExecDirect) instead of prepare()+executeNonQuery()"
          );
          (db as any).query(query, (err) => {
            if (err) return reject(err);
            resolve({ rows: [], affected: null, type, returnsRows });
          });
        } else {
          db.prepare(query, (err, stmt) => {
            if (err) return reject(err);
            stmt.executeNonQuery((err2, affected) => {
              try {
                stmt.closeSync(db.SQL_CLOSE);
              } catch (e) {
                /* ignore */
              }
              if (err2) return reject(err2);
              resolve({
                rows: [],
                affected: typeof affected === "number" ? affected : null,
                type,
                returnsRows,
              });
            });
          });
        }
      } catch (err) {
        reject(err);
      }
    });
  }

  // A statement is paginatable when it is a single SELECT or CTE (WITH) that
  // does not already carry its own outer paging clause. Only the tail is
  // inspected so a FETCH FIRST inside a subquery does not disable paging.
  private _isPaginatable(query: string): boolean {
    const kw = leadingKeyword(query);
    if (kw !== "SELECT" && kw !== "WITH") {
      return false;
    }
    const tail = query.slice(-150).toUpperCase();
    if (
      /\bFETCH\s+(FIRST|NEXT)\b/.test(tail) ||
      /\bLIMIT\b/.test(tail) ||
      /\bOFFSET\b/.test(tail)
    ) {
      return false;
    }
    return true;
  }

  // Promisified result-set fetch: returns { rows, cols } for a query.
  private _queryRows(
    db: Database,
    sql: string
  ): Promise<{ rows: any[]; cols: string[]; metadata?: any[] }> {
    return new Promise((resolve, reject) => {
      try {
        (db as any).queryResult(sql, (err, result) => {
          if (err) return reject(err);
          let cols: string[] = [];
          let metadata: any[] = [];
          try {
            metadata = result.getColumnMetadataSync() || [];
            if (Array.isArray(metadata)) {
              cols = metadata.map((m) => m.SQL_DESC_NAME || m.SQL_DESC_LABEL || m.name);
            }
          } catch (e) {
            /* metadata unavailable - fall back to row keys later */
          }
          result.fetchAll((err2, rows) => {
            try {
              result.closeSync();
            } catch (e) {
              /* ignore */
            }
            if (err2) return reject(err2);
            resolve({ rows: rows || [], cols, metadata });
          });
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  // Exact total row count for the query, by wrapping it in a derived table.
  // Rejects (so the caller falls back to a look-ahead estimate) on databases
  // where wrapping the statement is not accepted.
  private _countRows(db: Database, query: string): Promise<number> {
    const countQuery = `SELECT COUNT(*) AS "SQLTOOLS_TOTAL" FROM (${query}) AS "SQLTOOLS_CNT"`;
    return new Promise((resolve, reject) => {
      try {
        db.query(countQuery, (err, rows) => {
          if (err) return reject(err);
          if (!rows || rows.length === 0)
            return reject(new Error("Count query returned no rows."));
          const row = rows[0] as Record<string, any>;
          const raw =
            row.SQLTOOLS_TOTAL != null
              ? row.SQLTOOLS_TOTAL
              : row[Object.keys(row)[0]];
          const n = Number(raw);
          if (!isFinite(n))
            return reject(new Error("Count query returned a non-numeric value."));
          resolve(n);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  // Runs a SELECT/CTE limited to one page and determines the total row count.
  // The total comes from an exact COUNT; if that is rejected by the server, a
  // look-ahead row (pageSize + 1) is used to keep next/prev navigation working.
  // `knownTotal` lets the caller skip the COUNT when it already has an exact
  // total cached from an earlier page of the same query.
  private async _execPaginatedSelect(
    db: Database,
    query: string,
    page: number,
    pageSize: number,
    knownTotal?: number
  ): Promise<IPagedResult> {
    const offset = page * pageSize;
    const data = await this._queryRows(
      db,
      `${query} LIMIT ${pageSize + 1} OFFSET ${offset}`
    );
    const hasMore = data.rows.length > pageSize;
    const display = hasMore ? data.rows.slice(0, pageSize) : data.rows;
    let cols =
      data.cols && data.cols.length > 0
        ? data.cols
        : display.length > 0
        ? Object.keys(display[0])
        : [];

    if (typeof knownTotal === "number") {
      return { rows: display, cols, metadata: data.metadata, total: knownTotal, exact: true };
    }

    let total: number;
    let exact = true;
    try {
      total = await this._countRows(db, query);
    } catch (e) {
      // COUNT wrapper not accepted - advertise one extra page when more
      // rows exist so the grid keeps the "next" control enabled.
      exact = false;
      total = hasMore ? (page + 1) * pageSize + 1 : page * pageSize + display.length;
    }
    return { rows: display, cols, metadata: data.metadata, total, exact };
  }

  private async resolveResultEditability(db: Database, metadata: any[] = [], cols: string[], sql = '') {
    const sources = metadata.map((column, index) => ({
      index,
      column,
      table: column.SQL_DESC_TABLE_NAME || column.SQL_DESC_BASE_TABLE_NAME || column.TABLE_NAME || column.table,
      schema: column.SQL_DESC_SCHEMA_NAME || column.SQL_DESC_BASE_SCHEMA_NAME || column.TABLE_SCHEMA || column.schema,
      sourceColumn: column.SQL_DESC_BASE_COLUMN_NAME || column.SQL_DESC_NAME || column.SQL_DESC_LABEL || column.name,
    })).filter(source => source.table && source.schema && source.sourceColumn);
    let schema = sources[0]?.schema;
    let table = sources[0]?.table;
    const tables = [...new Set(sources.map(source => `${source.schema}.${source.table}`))];
    if (tables.length !== 1 || sources.length !== cols.length) {
      const singleTable = this.getSingleTableSource(sql);
      if (!singleTable) return { editable: false, nonEditableReason: 'Result does not identify one physical DB2 table.' };
      schema = singleTable.schema;
      table = singleTable.table;
    }

    const primaryKeyRows = await new Promise<any[]>((resolve, reject) => {
      db.query({
        sql: `SELECT COLNAME AS "column", KEYSEQ AS "keySeq" FROM SYSCAT.COLUMNS WHERE TABSCHEMA = ? AND TABNAME = ? AND KEYSEQ IS NOT NULL ORDER BY KEYSEQ`,
        params: [schema, table],
      }, (error, rows) => error ? reject(error) : resolve(rows || []));
    });
    const primaryKeys = primaryKeyRows.map(row => row.column || row.COLUMN);
    const includedColumns = new Set(sources.map(source => source.sourceColumn));
    const catalogColumns = await new Promise<any[]>((resolve, reject) => {
      db.query({
        sql: `SELECT COLNAME AS "column" FROM SYSCAT.COLUMNS WHERE TABSCHEMA = ? AND TABNAME = ? ORDER BY COLNO`,
        params: [schema, table],
      }, (error, rows) => error ? reject(error) : resolve(rows || []));
    });
    const knownColumns = new Set(catalogColumns.map(row => String(row.column || row.COLUMN || '').toUpperCase()));
    const resolvedSources = sources.length === cols.length
      ? sources
      : cols.map((name, index) => ({ index, sourceColumn: name, table, schema }));
    if (resolvedSources.some(source => !knownColumns.has(String(source.sourceColumn).toUpperCase()))) {
      return { editable: false, nonEditableReason: 'Result columns cannot be mapped to the source DB2 table.' };
    }
    const columnMeta = resolvedSources.map(source => ({
      name: cols[source.index],
      sourceColumn: source.sourceColumn,
      table: source.table,
      schema: source.schema,
      isPk: primaryKeys.some(column => String(column).toUpperCase() === String(source.sourceColumn).toUpperCase()),
      editable: !primaryKeys.some(column => String(column).toUpperCase() === String(source.sourceColumn).toUpperCase()),
    }));
    if (!primaryKeys.length) return { columnMeta, editable: false, nonEditableReason: 'Source table has no primary key.' };
    if (!primaryKeys.every(column => includedColumns.has(column))) {
      return { columnMeta, editable: false, nonEditableReason: 'Result must include every primary key column.' };
    }
    return { columnMeta, editable: true };
  }

  private getSingleTableSource(sql: string): { schema: string; table: string } | null {
    const normalized = stripLeadingNoise(sql).replace(/\s+/g, ' ');
    if (/\bJOIN\b|\bUNION\b|\bINTERSECT\b|\bEXCEPT\b|\bFROM\s*\(/i.test(normalized)) return null;
    const match = normalized.match(/\bFROM\s+(?:(?:"([^"]+)"|([A-Za-z_][\w$]*))\s*\.\s*)?(?:"([^"]+)"|([A-Za-z_][\w$]*))(?:\s+(?:AS\s+)?[A-Za-z_][\w$]*)?(?:\s|;|$)/i);
    if (!match) return null;
    return {
      schema: (match[1] || match[2] || this.credentials.schema || 'NULLID').toUpperCase(),
      table: (match[3] || match[4]).toUpperCase(),
    };
  }

  public async applyEdits(edits: IDb2ResultEdit[], _opt: any = {}): Promise<IDb2ResultEditResponse> {
    if (!edits.length) return { success: true };
    const db = await this.open();
    const quoteIdentifier = (identifier: string) => `"${identifier.replace(/"/g, '""')}"`;
    const executeNonQuery = (sql: string, params: any[]) => new Promise<number>((resolve, reject) => {
      db.prepare(sql, (prepareError, statement) => {
        if (prepareError) return reject(prepareError);
        statement.executeNonQuery(params, (error, affected) => {
          try { statement.closeSync((db as any).SQL_CLOSE); } catch (closeError) { /* ignore */ }
          if (error) return reject(error);
          resolve(typeof affected === 'number' ? affected : Number(affected) || 0);
        });
      });
    });
    try {
      await db.beginTransaction();
      for (let index = 0; index < edits.length; index++) {
        const { table, primaryKey, changes } = edits[index];
        const changeColumns = Object.keys(changes);
        const primaryKeyColumns = Object.keys(primaryKey);
        if (!table?.label || !changeColumns.length || !primaryKeyColumns.length) throw new Error('Invalid edit request.');
        const values = [...changeColumns.map(column => changes[column]), ...primaryKeyColumns.map(column => primaryKey[column])];
        const relation = [table.schema, table.label].filter(Boolean).map(quoteIdentifier).join('.');
        const setClause = changeColumns.map(column => `${quoteIdentifier(column)} = ?`).join(', ');
        const whereClause = primaryKeyColumns.map(column => `${quoteIdentifier(column)} = ?`).join(' AND ');
        const affected = await executeNonQuery(`UPDATE ${relation} SET ${setClause} WHERE ${whereClause}`, values);
        if (affected !== 1) {
          await db.rollbackTransaction();
          return { success: false, failedIndex: index, error: 'Row was modified or deleted since it was loaded.' };
        }
      }
      await db.commitTransaction();
      return { success: true };
    } catch (error) {
      await db.rollbackTransaction().catch(() => undefined);
      return { success: false, error: error?.message || String(error) };
    }
  }

  public query: (typeof AbstractDriver)["prototype"]["query"] = async (
    queries,
    opt = {}
  ) => {
    const qs = normalizeQueryInput(queries);
    const queryList = splitStatements(qs).filter(
      (stmt) => !isCommentOnlyStatement(stmt)
    );
    const db: Database = await this.open();
    const queryResults: any[] = [];

    // Page size comes from the grid (page changes), otherwise the
    // connection's previewLimit, otherwise a sane default.
    const pageSize = Math.max(
      1,
      Number(opt.pageSize) || Number(this.credentials.previewLimit) || 50
    );
    const page = Math.max(0, Number(opt.page) || 0);
    // Only paginate a lone SELECT/CTE; scripts with several statements or
    // DML keep their existing, unpaginated behaviour.
    const canPaginate = queryList.length === 1 && this._isPaginatable(queryList[0]);

    for (const query of queryList) {
      const startedAt = Date.now();
      try {
        if (canPaginate) {
          // Cache the exact total per (result tab + query) so COUNT runs
          // once when the query is (re)run on page 0, not on every page
          // turn. A fresh run lands on page 0 and refreshes the count.
          this._totalCache = this._totalCache || new Map();
          const cacheKey = `${opt.requestId || ""} ${query}`;
          const knownTotal = page === 0 ? undefined : this._totalCache.get(cacheKey);
          const paged = await this._execPaginatedSelect(
            db,
            query,
            page,
            pageSize,
            knownTotal
          );
          if (paged.exact) {
            this._totalCache.set(cacheKey, paged.total);
            if (this._totalCache.size > 100) {
              this._totalCache.delete(this._totalCache.keys().next().value);
            }
          }
          const elapsed = Date.now() - startedAt;
          const totalPages = Math.max(1, Math.ceil(paged.total / pageSize));
          const message = paged.exact
            ? `${paged.rows.length} row${
                paged.rows.length === 1 ? "" : "s"
              } shown - page ${page + 1} of ${totalPages} (${
                paged.total
              } total, ${pageSize}/page) in ${elapsed} ms.`
            : `${paged.rows.length} row${
                paged.rows.length === 1 ? "" : "s"
              } shown - page ${page + 1} (${pageSize}/page) in ${elapsed} ms.`;

          queryResults.push({
            connId: this.getId(),
            requestId: opt.requestId,
            resultId: generateId(),
            cols: paged.cols,
            ...(await this.resolveResultEditability(db, paged.metadata, paged.cols, query)),
            results: paged.rows,
            messages: [
              {
                date: new Date(),
                message,
              },
            ],
            query,
            // These fields drive the result pane's pagination. The
            // grid re-calls `sqltools.executeQuery` with the original
            // query and the new page/pageSize.
            queryType: "executeQuery",
            queryParams: query,
            page,
            pageSize,
            total: paged.total,
          });
          continue;
        }

        const exec = await this._execStatement(db, query);
        const elapsed = Date.now() - startedAt;

        if (exec.rows && exec.rows.length > 0) {
          const colnames =
            exec.cols && exec.cols.length > 0
              ? exec.cols
              : Object.keys(exec.rows[0]);
          queryResults.push({
            cols: colnames,
            ...(await this.resolveResultEditability(db, exec.metadata, colnames, query)),
            connId: this.getId(),
            messages: [
              {
                date: new Date(),
                message: `${exec.rows.length} row${
                  exec.rows.length === 1 ? "" : "s"
                } retrieved in ${elapsed} ms.`,
              },
            ],
            results: exec.rows,
            query,
            requestId: opt.requestId,
            resultId: generateId(),
          });
          continue;
        }

        // A real result set that came back empty (e.g. SELECT with no
        // matching rows): keep the column headers so the grid shows the
        // table shape rather than a synthetic status row.
        if (exec.returnsRows && exec.cols && exec.cols.length > 0) {
          queryResults.push({
            cols: exec.cols,
            ...(await this.resolveResultEditability(db, exec.metadata, exec.cols, query)),
            connId: this.getId(),
            messages: [
              {
                date: new Date(),
                message: `Query executed successfully. 0 rows retrieved in ${elapsed} ms.`,
              },
            ],
            results: [],
            query,
            requestId: opt.requestId,
            resultId: generateId(),
          });
          continue;
        }

        // No result set is available (DELETE/UPDATE/INSERT/MERGE/SET/DDL,
        // or a CALL that returned nothing). The results pane only renders
        // a grid, so surface the executed statement and its outcome as a
        // single-row grid instead of leaving the pane blank.
        const verb = exec.type ? exec.type : "Statement";
        let message: string;
        if (typeof exec.affected === "number" && exec.affected >= 0) {
          message = `${verb} executed successfully. ${exec.affected} row${
            exec.affected === 1 ? "" : "s"
          } affected (${elapsed} ms).`;
        } else if (exec.returnsRows) {
          message = `${verb} executed successfully. 0 rows returned (${elapsed} ms).`;
        } else {
          message = `${verb} executed successfully. No result set was returned (${elapsed} ms).`;
        }

        queryResults.push({
          connId: this.getId(),
          requestId: opt.requestId,
          resultId: generateId(),
          cols: ["Statement", "Result"],
          results: [{ Statement: query, Result: message }],
          messages: [
            {
              date: new Date(),
              message,
            },
          ],
          query,
        });
      } catch (error) {
        queryResults.push({
          connId: this.getId(),
          requestId: opt.requestId,
          resultId: generateId(),
          cols: ["Error"],
          error: true,
          rawError: error,
          messages: [
            {
              date: new Date(),
              message: error?.message || String(error),
            },
          ],
          query,
          results: [],
        });
      }
    }
    return queryResults;
  };

  public async getInsertQuery(params: {
    item: NSDatabase.ITable;
    columns: Array<NSDatabase.IColumn>;
  }): Promise<string> {
    const { item, columns } = params;
    console.log(item, columns);

    return new Promise(async (resolve, reject) => {
      try {
        (await this.connection).columns(
          null,
          item.schema,
          item.label,
          null,
          function (err, res) {
            if (err) {
              console.log("ERROR", err);
              reject("Error getting insert query.");
              return;
            }

            console.log("RESULT", res);

            const cols = (res || []) as Record<string, any>[];

            // Start building the query
            let insertQuery = `INSERT INTO "${item.schema}"."${
              item.label
            }" (${cols.map((col) => col.COLUMN_NAME).join(", ")}) VALUES (`;

            // Process columns
            for (const [index, col] of cols.entries()) {
              insertQuery = insertQuery.concat(
                `'\${${index + 1}:${col.COLUMN_NAME}:${col.TYPE_NAME}}', `
              );
            }

            // Remove the trailing comma and space, then close the VALUES clause
            insertQuery = insertQuery.slice(0, -2) + "')";
            console.log("INSERT QUERY", insertQuery);

            // Resolve the promise with the completed query
            resolve(insertQuery);
          }
        );
      } catch (error) {
        console.error("Unexpected error:", error);
        reject("Error during insert query generation.");
      }
    });
  }

  /** if you need a different way to test your connection, you can set it here.
   * Otherwise by default we open and close the connection only
   */
  public async testConnection() {
    await this.open();
    // await this.query('SELECT 1', {});
    await this.close();
  }

  /**
   * This method is a helper to generate the connection explorer tree.
   * it gets the child items based on current item
   */
  public async getChildrenForItem({
    item,
    parent,
  }: Arg0<IConnectionDriver["getChildrenForItem"]>) {
    switch (item.type) {
      case ContextValue.CONNECTION:
      case ContextValue.CONNECTED_CONNECTION:
        return this.queryResults(this.queries.fetchSchemas());
      case ContextValue.SCHEMA:
        return <MConnectionExplorer.IChildItem[]>[
          {
            label: "Tables",
            type: ContextValue.RESOURCE_GROUP,
            iconId: "folder",
            childType: ContextValue.TABLE,
          },
          {
            label: "Views",
            type: ContextValue.RESOURCE_GROUP,
            iconId: "folder",
            childType: ContextValue.VIEW,
          },
        ];
      case ContextValue.TABLE:
        return <MConnectionExplorer.IChildItem[]>[
          {
            label: "Column",
            type: ContextValue.RESOURCE_GROUP,
            iconId: "menu",
            childType: ContextValue.COLUMN,
          },
          {
            label: "Unique Constraints",
            type: ContextValue.RESOURCE_GROUP,
            iconId: "references",
            childType: ContextValue.COLUMN,
          },
          {
            label: "Foreign Keys",
            type: ContextValue.RESOURCE_GROUP,
            iconId: "references",
            childType: ContextValue.COLUMN,
            ind: "fk",
          },
        ];
      case ContextValue.VIEW:
      case ContextValue.COLUMN:
      case ContextValue.RESOURCE_GROUP:
        // console.log("here2");
        return this.getChildrenForGroup({ item, parent });
    }
    return [];
  }

  /**
   * This method is a helper to generate the connection explorer tree.
   * It gets the child based on child types
   */
  private async getChildrenForGroup({
    parent,
    item,
  }: Arg0<IConnectionDriver["getChildrenForItem"]>) {
    console.log({ item, parent });
    switch (item.childType) {
      case ContextValue.SCHEMA:
        return this.queryResults(
          this.queries.fetchSchemas(parent as NSDatabase.IDatabase)
        );
      case ContextValue.TABLE:
        return this.queryResults(
          this.queries.fetchTables(parent as NSDatabase.ISchema)
        );
      case ContextValue.VIEW:
        return this.queryResults(
          this.queries.fetchViews(parent as NSDatabase.ISchema)
        );
      case ContextValue.COLUMN:
        if (item.label === "Column") {
          return this.getColumns(parent as NSDatabase.ITable, "column");
        }
        if (item.label === "Unique Constraints") {
          return this.getColumns(parent as NSDatabase.ITable, "constraints");
        }
        return this.getColumns(parent as NSDatabase.ITable, "fk");
      case ContextValue.NO_CHILD:
    }
    return [];
  }

  private async getColumns(
    parent: NSDatabase.ITable,
    type: string
  ): Promise<NSDatabase.IColumn[]> {
    if (type === "column") {
      const results = await this.queryResults(
        this.queries.fetchColumns(parent)
      );
      // console.log("RES: ", results);
      if (results)
        return results.map((col) => ({
          ...col,
          iconName: col.isPk ? "pk" : col.isFk ? "fk" : null,
          childType: ContextValue.NO_CHILD,
          table: parent,
        }));
    }
    if (type === "constraints") {
      const results = await this.queryResults(
        this.queries.fetchPrimaryKeys(parent)
      );
      console.log("RES:", results);
      if (results) {
        // console.log("resss");
        return results.map((col) => ({
          ...col,
          iconName: "pk",
          childType: ContextValue.NO_CHILD,
          table: parent,
        }));
      }
      console.log("empty");
      return [<NSDatabase.IColumn>{}];
    }
    const results = await this.queryResults(
      this.queries.fetchForeignKeys(parent)
    );
    return results.map((col) => ({
      ...col,
      iconName: "fk",
      childType: ContextValue.NO_CHILD,
      table: parent,
    }));
  }

  /**
   * This method is a helper for intellisense and quick picks.
   */
  public async searchItems(
    itemType: ContextValue,
    search: string,
    extraParams: any = {}
  ): Promise<NSDatabase.SearchableItem[]> {
    // console.log("EXTRA: ", extraParams);
    switch (itemType) {
      case ContextValue.TABLE:
      case ContextValue.VIEW:
        return this.queryResults(this.queries.searchTables({ search: search }));
      case ContextValue.COLUMN:
        return this.queryResults(
          this.queries.searchColumns({ search, ...extraParams })
        );
    }
    return [];
  }

  //   private completionsCache: { [w: string]: NSDatabase.IStaticCompletion } =
  //     null;
  //   public getStaticCompletions = async () => {
  //     if (this.completionsCache) return this.completionsCache;
  //     // use default reserved words
  //     this.completionsCache = keywordsCompletion;

  //     return this.completionsCache;
  //   };
}
