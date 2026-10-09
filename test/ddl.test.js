const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  generateDb2TableDDL,
  loadDb2TableMetadata,
  renderTableDDL,
} = require('../out/ls/ddl');

const table = { schema: 'Mi"x', label: 'T"Orders', type: 'table', isView: false };

function makeMetadata(overrides = {}) {
  return {
    table: {
      schema: table.schema,
      name: table.label,
      type: 'T',
      typeSchema: null,
      typeName: null,
    },
    columns: [
      {
        name: 'Id',
        position: 0,
        typeSchema: 'SYSIBM',
        typeName: 'INTEGER',
        length: 4,
        scale: 0,
        stringUnits: null,
        stringUnitsLength: null,
        codepage: 0,
        nullable: 'N',
        defaultValue: null,
        identity: null,
        identityFlag: 'N',
        generated: null,
        generatedExpression: null,
        hidden: null,
        rowChangeTimestamp: 'N',
      },
      {
        name: 'Title',
        position: 1,
        typeSchema: 'SYSIBM',
        typeName: 'VARCHAR',
        length: 24,
        scale: 0,
        stringUnits: 'CODEUNITS32',
        stringUnitsLength: 8,
        codepage: 1200,
        nullable: 'Y',
        defaultValue: "'untitled'",
        identity: null,
        identityFlag: 'N',
        generated: null,
        generatedExpression: null,
        hidden: null,
        rowChangeTimestamp: 'N',
      },
      {
        name: 'Amount',
        position: 2,
        typeSchema: 'SYSIBM',
        typeName: 'DECIMAL',
        length: 31,
        scale: 9,
        stringUnits: null,
        stringUnitsLength: null,
        codepage: 0,
        nullable: 'N',
        defaultValue: 'CAST(0 AS DECIMAL(31, 9))',
        identity: null,
        identityFlag: 'N',
        generated: null,
        generatedExpression: null,
        hidden: null,
        rowChangeTimestamp: 'N',
      },
      {
        name: 'Picture',
        position: 3,
        typeSchema: 'SYSIBM',
        typeName: 'BLOB',
        length: 1048576,
        scale: 0,
        stringUnits: null,
        stringUnitsLength: null,
        codepage: 0,
        nullable: 'Y',
        defaultValue: null,
        identity: null,
        identityFlag: 'N',
        generated: null,
        generatedExpression: null,
        hidden: null,
        rowChangeTimestamp: 'N',
      },
      {
        name: 'Created',
        position: 4,
        typeSchema: 'SYSIBM',
        typeName: 'TIMESTAMP',
        length: 10,
        scale: 9,
        stringUnits: null,
        stringUnitsLength: null,
        codepage: 0,
        nullable: 'N',
        defaultValue: 'CURRENT TIMESTAMP',
        identity: null,
        identityFlag: 'N',
        generated: null,
        generatedExpression: null,
        hidden: null,
        rowChangeTimestamp: 'N',
      },
    ],
    constraints: [
      { name: 'PK_Order', type: 'P', enforced: 'Y', trusted: '', optimize: 'Y' },
      { name: 'UQ_Title', type: 'U', enforced: 'Y', trusted: '', optimize: 'Y' },
      { name: 'CK_Amount', type: 'K', enforced: 'Y', trusted: '', optimize: 'Y' },
      { name: 'FK_Order', type: 'F', enforced: 'Y', trusted: '', optimize: 'Y' },
    ],
    keyColumns: [
      { constraintName: 'PK_Order', columnName: 'Id', position: 1 },
      { constraintName: 'PK_Order', columnName: 'Title', position: 2 },
      { constraintName: 'UQ_Title', columnName: 'Title', position: 1 },
      { constraintName: 'FK_Order', columnName: 'Id', position: 1 },
      { constraintName: 'FK_Order', columnName: 'Title', position: 2 },
    ],
    checks: [{ name: 'CK_Amount', text: '"Amount" >= 0' }],
    foreignKeys: [
      {
        name: 'FK_Order',
        refSchema: 'Parent',
        refTable: 'Order Header',
        refKeyName: 'PK_Parent',
        deleteRule: 'C',
        updateRule: 'R',
        columnCount: 2,
        columns: [
          { name: 'Id', refName: 'ParentId', position: 1 },
          { name: 'Title', refName: 'ParentTitle', position: 2 },
        ],
      },
    ],
    indexes: [
      {
        schema: 'IdxSchema',
        name: 'IX_Title',
        uniqueRule: 'U',
        indexType: 'REG',
        systemRequired: 0,
        userDefined: 1,
        madeUnique: 'N',
        entryType: '',
        columnCount: 3,
        columns: [
          { name: 'Title', position: 1, order: 'D', virtual: 'N', expression: null, collationSchema: null, collationName: null },
          { name: 'Created', position: 2, order: 'A', virtual: 'N', expression: null, collationSchema: null, collationName: null },
          { name: 'Amount', position: 3, order: 'I', virtual: 'N', expression: null, collationSchema: null, collationName: null },
        ],
        backingConstraint: null,
      },
      {
        schema: 'IdxSchema',
        name: 'IX_PK_Backup',
        uniqueRule: 'P',
        indexType: 'REG',
        systemRequired: 1,
        userDefined: 0,
        madeUnique: 'Y',
        entryType: '',
        columnCount: 2,
        columns: [
          { name: 'Id', position: 1, order: 'A', virtual: 'N', expression: null, collationSchema: null, collationName: null },
          { name: 'Title', position: 2, order: 'A', virtual: 'N', expression: null, collationSchema: null, collationName: null },
        ],
        backingConstraint: 'P',
      },
    ],
    grants: [
      {
        grantee: 'PUBLIC',
        granteeType: 'P',
        control: 'N',
        privileges: { ALTER: 'N', DELETE: 'N', INDEX: 'N', INSERT: 'N', REFERENCES: 'N', SELECT: 'Y', UPDATE: 'N' },
      },
      {
        grantee: 'Dev Group',
        granteeType: 'G',
        control: 'N',
        privileges: { ALTER: 'N', DELETE: 'G', INDEX: 'N', INSERT: 'Y', REFERENCES: 'N', SELECT: 'N', UPDATE: 'N' },
      },
      {
        grantee: 'App Role',
        granteeType: 'R',
        control: 'N',
        privileges: { ALTER: 'N', DELETE: 'N', INDEX: 'N', INSERT: 'N', REFERENCES: 'G', SELECT: 'N', UPDATE: 'N' },
      },
      {
        grantee: 'Owner User',
        granteeType: 'U',
        control: 'Y',
        privileges: { ALTER: 'N', DELETE: 'N', INDEX: 'N', INSERT: 'N', REFERENCES: 'N', SELECT: 'N', UPDATE: 'Y' },
      },
    ],
    ...overrides,
  };
}

function emptyCatalogRows(sql) {
  if (sql.includes('FROM SYSCAT.TABLES')) {
    return [{ type: 'T', row_type_schema: null, row_type_name: null }];
  }
  if (sql.includes('FROM SYSCAT.PERIODS')) return [];
  if (sql.includes('FROM SYSCAT.CONTROLS')) return [];
  if (sql.includes('FROM SYSCAT.COLUMNS')) return [];
  return [];
}

function buildLoaderConnection(overrides = {}) {
  const calls = [];
  let active = 0;
  let maxActive = 0;
  return {
    calls,
    get maxActive() {
      return maxActive;
    },
    query: async ({ sql, params }) => {
      calls.push({ sql, params });
      active++;
      maxActive = Math.max(active, maxActive);
      try {
        if (overrides.errorAt === calls.length) throw new Error('permission denied');
        const rows = overrides.rows
          ? overrides.rows(sql, calls.length)
          : emptyCatalogRows(sql);
        await new Promise((resolve) => setImmediate(resolve));
        return rows;
      } finally {
        active--;
      }
    },
  };
}

test('renders exact deterministic logical DDL and preserves identifier case', () => {
  const sql = renderTableDDL(makeMetadata());
  assert.equal(
    sql,
    [
      '-- Logical Db2 LUW DDL; physical attributes, triggers, data, and column grants are excluded.',
      '-- Referenced tables and principals must already exist. This script is not executed automatically.',
      '',
      'CREATE TABLE "Mi""x"."T""Orders" (',
      '  "Id" INTEGER NOT NULL,',
      '  "Title" VARCHAR(8 CODEUNITS32) DEFAULT \'untitled\',',
      '  "Amount" DECIMAL(31, 9) DEFAULT CAST(0 AS DECIMAL(31, 9)) NOT NULL,',
      '  "Picture" BLOB(1048576),',
      '  "Created" TIMESTAMP(9) DEFAULT CURRENT TIMESTAMP NOT NULL,',
      '  CONSTRAINT "PK_Order" PRIMARY KEY ("Id", "Title"),',
      '  CONSTRAINT "UQ_Title" UNIQUE ("Title"),',
      '  CONSTRAINT "CK_Amount" CHECK ("Amount" >= 0),',
      '  CONSTRAINT "FK_Order" FOREIGN KEY ("Id", "Title") REFERENCES "Parent"."Order Header" ("ParentId", "ParentTitle") ON DELETE CASCADE ON UPDATE RESTRICT',
      ');',
      '',
      'CREATE UNIQUE INDEX "IdxSchema"."IX_Title" ON "Mi""x"."T""Orders" ("Title" DESC, "Created" ASC) INCLUDE ("Amount");',
      '',
      'GRANT CONTROL ON TABLE "Mi""x"."T""Orders" TO USER "Owner User";',
      'GRANT DELETE ON TABLE "Mi""x"."T""Orders" TO GROUP "Dev Group" WITH GRANT OPTION;',
      'GRANT INSERT ON TABLE "Mi""x"."T""Orders" TO GROUP "Dev Group";',
      'GRANT REFERENCES ON TABLE "Mi""x"."T""Orders" TO ROLE "App Role" WITH GRANT OPTION;',
      'GRANT SELECT ON TABLE "Mi""x"."T""Orders" TO PUBLIC;',
      'GRANT UPDATE ON TABLE "Mi""x"."T""Orders" TO USER "Owner User";',
      '',
    ].join('\n')
  );
  assert.equal(renderTableDDL(makeMetadata()), sql);
  const shuffled = makeMetadata();
  shuffled.columns.reverse();
  shuffled.constraints.reverse();
  shuffled.keyColumns.reverse();
  shuffled.foreignKeys[0].columns.reverse();
  shuffled.indexes.reverse();
  shuffled.grants.reverse();
  assert.equal(renderTableDDL(shuffled), sql);
  assert.ok(sql.endsWith(';\n'));
});

test('renders identity modes and large catalog decimals without Number conversion', () => {
  for (const [mode, phrase] of [['A', 'GENERATED ALWAYS'], ['D', 'GENERATED BY DEFAULT']]) {
    const metadata = makeMetadata();
    metadata.columns[0].identity = {
      mode,
      start: '9007199254740993123456789',
      increment: '-2',
      minValue: '-9999999999999999999999999',
      maxValue: '9999999999999999999999999',
      cycle: 'Y',
      cache: '0',
      order: 'N',
    };
    metadata.columns[0].identityFlag = 'Y';
    metadata.columns[0].generated = mode;
    const sql = renderTableDDL(metadata);
    assert.ok(sql.includes(`${phrase} AS IDENTITY (START WITH 9007199254740993123456789`));
    assert.ok(sql.includes('INCREMENT BY -2 MINVALUE -9999999999999999999999999'));
    assert.ok(sql.includes('MAXVALUE 9999999999999999999999999 CYCLE NO CACHE NO ORDER'));
  }
});

test('renders character, binary, graphic, LOB, and timestamp type variants', () => {
  const metadata = makeMetadata();
  const variants = [
    ['Bits', 'CHAR', 12, 0, null, null, 0, 'CHAR(12) FOR BIT DATA'],
    ['GraphicText', 'VARGRAPHIC', 40, 0, 'CODEUNITS16', 20, 1200, 'VARGRAPHIC(20 CODEUNITS16)'],
    ['Document', 'CLOB', 1048576, 0, null, null, 1200, 'CLOB(1048576)'],
    ['RawBytes', 'VARBINARY', 32, 0, null, null, 0, 'VARBINARY(32)'],
  ];
  for (const [name, typeName, length, scale, stringUnits, stringUnitsLength, codepage, expected] of variants) {
    metadata.columns.push({
      name,
      position: metadata.columns.length,
      typeSchema: 'SYSIBM',
      typeName,
      length,
      scale,
      stringUnits,
      stringUnitsLength,
      codepage,
      nullable: 'Y',
      defaultValue: null,
      identity: null,
      identityFlag: 'N',
      generated: null,
      generatedExpression: null,
      hidden: null,
      rowChangeTimestamp: 'N',
    });
  }
  const sql = renderTableDDL(metadata);
  for (const [name, , , , , , , expected] of variants) {
    assert.ok(sql.includes(`"${name}" ${expected}`));
  }
});

test('recognizes padded SYSIBM built-in type metadata without changing column identifiers', () => {
  const metadata = makeMetadata();
  for (const column of metadata.columns) {
    column.typeSchema = 'SYSIBM  ';
    column.typeName += ' ';
  }
  assert.equal(renderTableDDL(metadata), renderTableDDL(makeMetadata()));
});

test('renders all documented foreign-key delete and update rules', () => {
  const deleteRules = { A: 'NO ACTION', C: 'CASCADE', N: 'SET NULL', R: 'RESTRICT' };
  const updateRules = { A: 'NO ACTION', R: 'RESTRICT' };
  for (const [code, sqlRule] of Object.entries(deleteRules)) {
    const metadata = makeMetadata();
    metadata.foreignKeys[0].deleteRule = code;
    assert.ok(renderTableDDL(metadata).includes(`ON DELETE ${sqlRule} ON UPDATE RESTRICT`));
  }
  for (const [code, sqlRule] of Object.entries(updateRules)) {
    const metadata = makeMetadata();
    metadata.foreignKeys[0].updateRule = code;
    assert.ok(renderTableDDL(metadata).includes(`ON UPDATE ${sqlRule}`));
  }
});

test('rejects unsupported logical definitions and incomplete dependent metadata', () => {
  const cases = [
    [metadata => { metadata.table.type = 'S'; }, /ordinary base table/],
    [metadata => { metadata.columns[0].typeSchema = 'CUSTOM'; }, /unsupported distinct or user-defined type/],
    [metadata => { metadata.columns[0].generatedExpression = '"Id" \+ 1'; }, /Generated expression/],
    [metadata => { metadata.columns[0].hidden = 'I'; }, /Hidden column/],
    [metadata => { metadata.columns[0].rowChangeTimestamp = 'Y'; }, /Row-change timestamp/],
    [metadata => { metadata.constraints[0].enforced = 'N'; }, /not enforced/],
    [metadata => { metadata.foreignKeys[0].columns.pop(); }, /foreign-key columns are incomplete/],
    [metadata => { metadata.indexes[0].columns[0].order = 'R'; }, /unsupported column ordering/],
    [metadata => { metadata.indexes[0].columns[0].expression = 'UPPER\(Title\)'; }, /expression, virtual, or collated/],
    [metadata => { metadata.constraints = [{ name: 'X', type: 'I', enforced: 'Y', trusted: '', optimize: 'Y' }]; }, /unsupported Db2 constraint type/],
  ];
  for (const [mutate, expected] of cases) {
    const metadata = makeMetadata();
    mutate(metadata);
    assert.throws(() => renderTableDDL(metadata), expected);
  }
  const identity = makeMetadata();
  identity.columns[0].identityFlag = 'Y';
  identity.columns[0].identity = {
    mode: null,
    start: '1',
    increment: '1',
    minValue: '1',
    maxValue: '99',
    cycle: 'N',
    cache: '20',
    order: 'N',
  };
  assert.throws(() => renderTableDDL(identity), /did not expose the identity generation mode/);
});

test('loads catalog metadata completely, sequentially, and with exact identifiers', async () => {
  const rowsFor = (sql) => {
    if (sql.includes('FROM SYSCAT.TABLES')) {
      return [{ type: 'T', row_type_schema: null, row_type_name: null }];
    }
    if (sql.includes('FROM SYSCAT.COLUMNS')) {
      return Array.from({ length: 137 }, (_, position) => ({
        position,
        name: `Col${position}`,
        type_schema: 'SYSIBM',
        type_name: 'INTEGER',
        length: 4,
        scale: 0,
        string_units: null,
        string_units_length: null,
        codepage: 0,
        nullable: 'Y',
        default_value: null,
        identity_flag: 'N',
        generated: ' ',
        generated_expression: null,
        hidden: ' ',
        row_change_timestamp: 'N',
      }));
    }
    return [];
  };
  const db = buildLoaderConnection({ rows: rowsFor });
  const metadata = await loadDb2TableMetadata(db, table);
  assert.equal(metadata.columns.length, 137);
  assert.equal(db.calls.length, 13);
  assert.equal(db.maxActive, 1);
  assert.deepEqual(db.calls[0].params, ['Mi"x', 'T"Orders']);
  assert.ok(db.calls.every(({ sql }) => !/\b(?:LIMIT|FETCH\s+(?:FIRST|NEXT))\b/i.test(sql)));
  assert.ok(db.calls.every(({ sql }) => /^\s*SELECT\b/i.test(sql)));
  assert.match(db.calls[1].sql, /SYSCAT\.PERIODS/);
  assert.match(db.calls[2].sql, /SYSCAT\.CONTROLS/);
  assert.match(db.calls[6].sql, /SYSCAT\.KEYCOLUSE/);
  assert.match(db.calls[7].sql, /SYSCAT\.CHECKS/);
  assert.match(db.calls[8].sql, /SYSCAT\.REFERENCES/);
  const indexColumnsQuery = db.calls[10];
  assert.match(indexColumnsQuery.sql, /FROM SYSCAT\.INDEXCOLUSE C\s+JOIN SYSCAT\.INDEXES I/);
  assert.match(indexColumnsQuery.sql, /ON I\.INDSCHEMA = C\.INDSCHEMA AND I\.INDNAME = C\.INDNAME/);
  assert.match(indexColumnsQuery.sql, /WHERE I\.TABSCHEMA = \? AND I\.TABNAME = \?/);
  assert.match(indexColumnsQuery.sql, /ORDER BY C\.INDSCHEMA, C\.INDNAME, C\.COLSEQ/);
  assert.doesNotMatch(indexColumnsQuery.sql, /\bC\.(?:TABSCHEMA|TABNAME)\b/);
  assert.deepEqual(indexColumnsQuery.params, [table.schema, table.label]);
  assert.match(db.calls[11].sql, /SYSCAT\.CONSTDEP/);
  assert.match(db.calls[12].sql, /SYSCAT\.TABAUTH/);
});

test('rejects missing objects, catalog errors, and absent dependent metadata', async () => {
  const missing = buildLoaderConnection({ rows: () => [] });
  await assert.rejects(loadDb2TableMetadata(missing, table), /was not found or is not visible/);

  const denied = buildLoaderConnection({ errorAt: 4 });
  await assert.rejects(loadDb2TableMetadata(denied, table), /Unable to load Db2 DDL columns: permission denied/);
  assert.equal(denied.calls.length, 4);

  const noColumns = buildLoaderConnection({
    rows: sql => sql.includes('FROM SYSCAT.TABLES')
      ? [{ type: 'T', row_type_schema: null, row_type_name: null }]
      : [],
  });
  await assert.rejects(loadDb2TableMetadata(noColumns, table), /returned no columns/);

  const temporal = buildLoaderConnection({
    rows: sql => sql.includes('FROM SYSCAT.TABLES')
      ? [{ type: 'T', row_type_schema: null, row_type_name: null }]
      : sql.includes('FROM SYSCAT.PERIODS') || sql.includes('FROM SYSCAT.CONTROLS')
        ? [{ name: 'SYSTEM_TIME', type: 'S' }]
        : [],
  });
  await assert.rejects(loadDb2TableMetadata(temporal, table), /Temporal table/);
  assert.equal(temporal.calls.length, 2);

  const invalidResult = buildLoaderConnection({
    rows: sql => sql.includes('FROM SYSCAT.TABLES')
      ? [{ type: 'T', row_type_schema: null, row_type_name: null }]
      : sql.includes('FROM SYSCAT.COLUMNS')
        ? [{ position: 0, name: 'ID', type_schema: 'SYSIBM', type_name: 'INTEGER', length: 4, scale: 0, string_units: null, string_units_length: null, codepage: 0, nullable: 'N', default_value: null, identity_flag: 'N', generated: ' ', generated_expression: null, hidden: ' ', row_change_timestamp: 'N' }]
        : { error: 'catalog returned an error-shaped value' },
  });
  await assert.rejects(loadDb2TableMetadata(invalidResult, table), /query returned invalid results/);

  const brokenFk = makeMetadata();
  brokenFk.foreignKeys[0].columns[0].refName = null;
  assert.throws(() => renderTableDDL(brokenFk), /missing referenced-column metadata/);
});

test('rejects active row permissions and column masks from SYSCAT.CONTROLS', async () => {
  for (const [type, label] of [['R', 'row permission'], ['C', 'column mask']]) {
    for (const enabled of ['Y', 'N']) {
      const name = `${enabled === 'Y' ? 'ACTIVE' : 'DISABLED'}_${type}`;
      const db = buildLoaderConnection({
        rows: sql => {
          if (sql.includes('FROM SYSCAT.TABLES')) {
            return [{ type: 'T', row_type_schema: null, row_type_name: null }];
          }
          if (sql.includes('FROM SYSCAT.PERIODS')) return [];
          if (sql.includes('FROM SYSCAT.CONTROLS')) {
            return [{ name, type, enabled, valid: 'Y' }];
          }
          return [];
        },
      });
      await assert.rejects(
        loadDb2TableMetadata(db, table),
        new RegExp(`has an unsupported ${label} "${name}" \\(${enabled === 'Y' ? 'enabled' : 'disabled definition'}\\)`)
      );
      assert.equal(db.calls.length, 3);
      assert.match(db.calls[2].sql, /FROM SYSCAT\.CONTROLS/);
      assert.deepEqual(db.calls[2].params, ['Mi"x', 'T"Orders']);
    }
  }
});

function dependencyFixtureConnection(dependency) {
  return buildLoaderConnection({
    rows: sql => {
      if (sql.includes('FROM SYSCAT.TABLES')) {
        return [{ type: 'T', row_type_schema: null, row_type_name: null }];
      }
      if (sql.includes('FROM SYSCAT.PERIODS') || sql.includes('FROM SYSCAT.CONTROLS')) return [];
      if (sql.includes('FROM SYSCAT.COLUMNS')) {
        return [{
          position: 0,
          name: 'ID',
          type_schema: 'SYSIBM',
          type_name: 'INTEGER',
          length: 4,
          scale: 0,
          string_units: null,
          string_units_length: null,
          codepage: 0,
          nullable: 'N',
          default_value: null,
          identity_flag: 'N',
          generated: ' ',
          generated_expression: null,
          hidden: ' ',
          row_change_timestamp: 'N',
        }];
      }
      if (sql.includes('FROM SYSCAT.TABCONST')) {
        return [{ name: 'PK_ID', type: 'P', enforced: 'Y', trusted: '', optimize: 'Y' }];
      }
      if (sql.includes('FROM SYSCAT.KEYCOLUSE')) {
        return [{ constraint_name: 'PK_ID', column_name: 'ID', position: 1 }];
      }
      if (sql.includes('FROM SYSCAT.INDEXES')) {
        return [{
          schema: 'IXSCHEMA',
          name: 'IX_PK',
          unique_rule: 'P',
          index_type: 'REG',
          system_required: 1,
          user_defined: 0,
          made_unique: 'Y',
          entry_type: '',
          column_count: 1,
        }];
      }
      if (sql.includes('FROM SYSCAT.INDEXCOLUSE')) {
        return [{
          schema: 'IXSCHEMA',
          index_name: 'IX_PK',
          column_name: 'ID',
          position: 1,
          order: 'A',
          virtual: 'N',
          expression: null,
          collation_schema: null,
          collation_name: null,
        }];
      }
      if (sql.includes('FROM SYSCAT.CONSTDEP')) return [dependency];
      return [];
    },
  });
}

test('uses actual CONSTDEP index association to omit the primary-key backing index', async () => {
  const db = dependencyFixtureConnection({
    constraint_name: 'PK_ID',
    constraint_type: 'P',
    schema: 'IXSCHEMA',
    index_name: 'IX_PK',
  });
  const metadata = await loadDb2TableMetadata(db, table);
  assert.equal(metadata.indexes.length, 1);
  assert.equal(metadata.indexes[0].backingConstraint, 'P');
  const sql = renderTableDDL(metadata);
  assert.match(sql, /CONSTRAINT "PK_ID" PRIMARY KEY \("ID"\)/);
  assert.doesNotMatch(sql, /CREATE UNIQUE INDEX/);
});

test('rejects unsupported and orphaned CONSTDEP index relationships', async () => {
  const unsupported = dependencyFixtureConnection({
    constraint_name: 'CHECK_ID',
    constraint_type: 'K',
    schema: 'IXSCHEMA',
    index_name: 'IX_PK',
  });
  await assert.rejects(
    loadDb2TableMetadata(unsupported, table),
    /dependency from unsupported constraint "CHECK_ID"/
  );

  const orphaned = dependencyFixtureConnection({
    constraint_name: 'PK_ID',
    constraint_type: 'P',
    schema: 'OTHER_SCHEMA',
    index_name: 'MISSING_INDEX',
  });
  await assert.rejects(
    loadDb2TableMetadata(orphaned, table),
    /index dependency without index metadata/
  );
});

test('loads Db2 identity generation mode and renders it without losing catalog precision', async () => {
  const identityConnection = buildLoaderConnection({
    rows: sql => {
      if (sql.includes('FROM SYSCAT.TABLES')) {
        return [{ type: 'T', row_type_schema: null, row_type_name: null }];
      }
      if (sql.includes('FROM SYSCAT.PERIODS') || sql.includes('FROM SYSCAT.CONTROLS')) return [];
      if (sql.includes('FROM SYSCAT.COLUMNS')) {
        return [{
          position: 0,
          name: 'ID',
          type_schema: 'SYSIBM',
          type_name: 'INTEGER',
          length: 4,
          scale: 0,
          string_units: null,
          string_units_length: null,
          codepage: 0,
          nullable: 'N',
          default_value: null,
          identity_flag: 'Y',
          generated: 'A',
          generated_expression: null,
          hidden: ' ',
          row_change_timestamp: 'N',
        }];
      }
      if (sql.includes('FROM SYSCAT.COLIDENTATTRIBUTES')) {
        return [{
          column_name: 'ID',
          start: '1',
          increment: '1',
          min_value: '1',
          max_value: '2147483647',
          cycle: 'N',
          cache: '20',
          order: 'N',
        }];
      }
      return [];
    },
  });
  const metadata = await loadDb2TableMetadata(identityConnection, table);
  assert.equal(metadata.columns[0].identity.mode, 'A');
  assert.match(renderTableDDL(metadata), /GENERATED ALWAYS AS IDENTITY/);
});

test('does not silently discard index dependencies, grants, or invalid identifiers', async () => {
  const unexpectedDependency = makeMetadata();
  unexpectedDependency.indexes[0].backingConstraint = 'F';
  assert.throws(() => renderTableDDL(unexpectedDependency), /unsupported constraint/);

  const unsupportedGrant = makeMetadata();
  unsupportedGrant.grants[0].granteeType = 'X';
  assert.throws(() => renderTableDDL(unsupportedGrant), /unsupported grantee type/);

  const invalidTable = { ...table, schema: '' };
  await assert.rejects(
    generateDb2TableDDL(buildLoaderConnection(), invalidTable),
    /requires a table with its catalog schema and name/
  );
  await assert.rejects(
    generateDb2TableDDL(buildLoaderConnection(), { ...table, isView: true }),
    /supports Db2 tables only/
  );
});
