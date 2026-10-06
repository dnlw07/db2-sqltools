const assert = require('node:assert/strict');
const { test } = require('node:test');
const queries = require('../out/ls/queries').default;

test('column completion normalizes unquoted Db2 table and schema names', () => {
  const query = queries.searchColumns({
    search: '',
    tables: [{ label: 'employees', database: 'qdr00687' }],
  });
  assert.match(query, /WHERE tabname = 'EMPLOYEES'/);
  assert.match(query, /AND tabschema = 'QDR00687'/);
});

test('uppercase catalog names continue to resolve', () => {
  const query = queries.searchColumns({
    search: '',
    tables: [{ label: 'TABLES', database: 'SYSCAT' }],
  });
  assert.match(query, /WHERE tabname = 'TABLES'/);
  assert.match(query, /AND tabschema = 'SYSCAT'/);
});

test('column lookup escapes catalog identifier literals', () => {
  const query = queries.searchColumns({
    search: '',
    tables: [{ label: "employee's", database: "schema's" }],
  });
  assert.match(query, /WHERE tabname = 'EMPLOYEE''S'/);
  assert.match(query, /AND tabschema = 'SCHEMA''S'/);
});

test('an empty table list still produces an empty catalog lookup', () => {
  const query = queries.searchColumns({ search: '', tables: [] });
  assert.match(query, /WHERE tabname = ''/);
  assert.match(query, /AND tabschema = ''/);
});
