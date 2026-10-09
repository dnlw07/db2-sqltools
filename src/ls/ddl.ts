import { NSDatabase } from "@sqltools/types";

type CatalogRow = Record<string, unknown>;

interface DdlConnection {
  query(query: { sql: string; params: string[] }): Promise<unknown>;
}

interface DdlTable {
  schema: string;
  name: string;
  type: string;
  typeSchema: string | null;
  typeName: string | null;
}

interface DdlColumn {
  name: string;
  position: number;
  typeSchema: string;
  typeName: string;
  length: number;
  scale: number;
  stringUnits: string | null;
  stringUnitsLength: number | null;
  codepage: number;
  nullable: string;
  defaultValue: string | null;
  identity: IdentityMetadata | null;
  identityFlag: string;
  generated: string | null;
  generatedExpression: string | null;
  hidden: string | null;
  rowChangeTimestamp: string;
}

interface IdentityMetadata {
  mode: string | null;
  start: string | null;
  increment: string | null;
  minValue: string | null;
  maxValue: string | null;
  cycle: string;
  cache: string;
  order: string;
}

interface DdlConstraint {
  name: string;
  type: string;
  enforced: string;
  trusted: string;
  optimize: string;
}

interface DdlKeyColumn {
  constraintName: string;
  columnName: string;
  position: number;
}

interface DdlCheck {
  name: string;
  text: string | null;
}

interface DdlForeignKey {
  name: string;
  refSchema: string;
  refTable: string;
  refKeyName: string;
  deleteRule: string;
  updateRule: string;
  columnCount: number;
  columns: { name: string; refName: string; position: number }[];
}

interface DdlIndex {
  schema: string;
  name: string;
  uniqueRule: string;
  indexType: string;
  systemRequired: number;
  userDefined: number;
  madeUnique: string;
  entryType: string;
  columnCount: number;
  columns: DdlIndexColumn[];
  backingConstraint: string | null;
}

interface DdlIndexColumn {
  name: string;
  position: number;
  order: string;
  virtual: string | null;
  expression: string | null;
  collationSchema: string | null;
  collationName: string | null;
}

interface DdlGrant {
  grantee: string;
  granteeType: string;
  control: string;
  privileges: Record<string, string>;
}

export interface Db2TableMetadata {
  table: DdlTable;
  columns: DdlColumn[];
  constraints: DdlConstraint[];
  keyColumns: DdlKeyColumn[];
  checks: DdlCheck[];
  foreignKeys: DdlForeignKey[];
  indexes: DdlIndex[];
  grants: DdlGrant[];
}

function field(row: CatalogRow, name: string): unknown {
  if (Object.prototype.hasOwnProperty.call(row, name)) return row[name];
  const upper = name.toUpperCase();
  if (Object.prototype.hasOwnProperty.call(row, upper)) return row[upper];
  const key = Object.keys(row).find((candidate) => candidate.toUpperCase() === upper);
  return key === undefined ? undefined : row[key];
}

function requiredString(row: CatalogRow, name: string, context: string): string {
  const value = field(row, name);
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Db2 DDL metadata is missing ${name} for ${context}.`);
  }
  return value;
}

function nullableString(row: CatalogRow, name: string): string | null {
  const value = field(row, name);
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new Error(`Db2 DDL metadata field ${name} is not text.`);
  }
  return value;
}

function requiredNumber(row: CatalogRow, name: string, context: string): number {
  const value = field(row, name);
  const number = typeof value === "number" ? value : Number(value);
  if (value === null || value === undefined || !Number.isSafeInteger(number)) {
    throw new Error(`Db2 DDL metadata is missing a valid ${name} for ${context}.`);
  }
  return number;
}

function queryRows(
  db: DdlConnection,
  sql: string,
  params: string[],
  context: string
): Promise<CatalogRow[]> {
  return db
    .query({ sql, params })
    .then((rows) => {
      if (!Array.isArray(rows)) {
        throw new Error(`Db2 DDL ${context} query returned invalid results.`);
      }
      return rows;
    })
    .catch((error) => {
      throw new Error(
        `Unable to load Db2 DDL ${context}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    });
}

function identityNumber(
  row: CatalogRow,
  name: string,
  context: string,
  nullable = false
): string | null {
  const value = field(row, name);
  if (value === null || value === undefined) {
    if (nullable) return null;
    throw new Error(`Db2 DDL metadata is missing ${name} for ${context}.`);
  }
  if (typeof value === "number" && !Number.isSafeInteger(value)) {
    throw new Error(`Db2 returned an imprecise ${name} for ${context}.`);
  }
  const text = String(value).trim();
  if (!/^[+-]?\d+$/.test(text)) {
    throw new Error(`Db2 returned an invalid ${name} for ${context}.`);
  }
  return text;
}

export async function loadDb2TableMetadata(
  db: DdlConnection,
  table: NSDatabase.ITable
): Promise<Db2TableMetadata> {
  if (!table || typeof table.schema !== "string" || !table.schema ||
      typeof table.label !== "string" || !table.label) {
    throw new Error("Generate DDL requires a table with its catalog schema and name.");
  }
  if (table.isView) {
    throw new Error("Generate DDL supports Db2 tables only; views are not supported.");
  }

  const params = [table.schema, table.label];
  const tableRows = await queryRows(
    db,
    `SELECT TYPE AS "type", ROWTYPESCHEMA AS "row_type_schema",
            ROWTYPENAME AS "row_type_name"
       FROM SYSCAT.TABLES WHERE TABSCHEMA = ? AND TABNAME = ?`,
    params,
    "table definition"
  );
  if (tableRows.length !== 1) {
    throw new Error(
      tableRows.length === 0
        ? `Db2 table "${table.schema}"."${table.label}" was not found or is not visible.`
        : `Db2 returned duplicate table metadata for "${table.schema}"."${table.label}".`
    );
  }
  const tableRow = tableRows[0];
  const tableType = requiredString(tableRow, "type", "table");
  const typeSchema = nullableString(tableRow, "row_type_schema");
  const typeName = nullableString(tableRow, "row_type_name");
  if (tableType !== "T" || typeSchema || typeName) {
    throw new Error(
      `Db2 DDL supports ordinary untyped base tables only; table type "${tableType}" is unsupported.`
    );
  }

  const periodRows = await queryRows(
    db,
    `SELECT PERIODNAME AS "name", PERIODTYPE AS "type"
       FROM SYSCAT.PERIODS WHERE TABSCHEMA = ? AND TABNAME = ?
       ORDER BY PERIODNAME`,
    params,
    "temporal periods"
  );
  if (periodRows.length > 0) {
    throw new Error(
      `Temporal table "${table.schema}"."${table.label}" is not supported by logical Db2 DDL.`
    );
  }

  const controls = await queryRows(
    db,
    `SELECT CONTROLNAME AS "name", CONTROLTYPE AS "type", ENABLE AS "enabled",
            VALID AS "valid"
       FROM SYSCAT.CONTROLS WHERE TABSCHEMA = ? AND TABNAME = ?
       ORDER BY CONTROLTYPE, CONTROLNAME`,
    params,
    "row permissions and column masks"
  );
  for (const control of controls) {
    const name = requiredString(control, "name", "security control");
    const controlType = requiredString(control, "type", name).trim();
    const enabled = requiredString(control, "enabled", name).trim();
    const valid = requiredString(control, "valid", name).trim();
    if (!["R", "C"].includes(controlType) || !["Y", "N"].includes(enabled) ||
        !["Y", "N"].includes(valid)) {
      throw new Error(`Db2 returned unsupported security-control metadata for "${name}".`);
    }
    throw new Error(
      `Db2 table "${table.schema}"."${table.label}" has an unsupported ` +
        `${controlType === "R" ? "row permission" : "column mask"} "${name}"` +
        `${enabled === "Y" ? " (enabled)" : " (disabled definition)"}; logical DDL generation was stopped.`
    );
  }

  const columnsRows = await queryRows(
    db,
    `SELECT COLNO AS "position", COLNAME AS "name", TYPESCHEMA AS "type_schema",
            TYPENAME AS "type_name", LENGTH AS "length", SCALE AS "scale",
            TYPESTRINGUNITS AS "string_units", STRINGUNITSLENGTH AS "string_units_length",
            CODEPAGE AS "codepage", NULLS AS "nullable", DEFAULT AS "default_value",
            IDENTITY AS "identity_flag", GENERATED AS "generated",
            TEXT AS "generated_expression", HIDDEN AS "hidden",
            ROWCHANGETIMESTAMP AS "row_change_timestamp"
       FROM SYSCAT.COLUMNS WHERE TABSCHEMA = ? AND TABNAME = ? ORDER BY COLNO`,
    params,
    "columns"
  );
  if (columnsRows.length === 0) {
    throw new Error(`Db2 returned no columns for "${table.schema}"."${table.label}".`);
  }
  const identityRows = await queryRows(
    db,
    `SELECT COLNAME AS "column_name",
            CAST("START" AS VARCHAR(31)) AS "start",
            CAST("INCREMENT" AS VARCHAR(31)) AS "increment",
            CAST(MINVALUE AS VARCHAR(31)) AS "min_value",
            CAST(MAXVALUE AS VARCHAR(31)) AS "max_value",
            CYCLE AS "cycle", CAST(CACHE AS VARCHAR(31)) AS "cache", "ORDER" AS "order"
       FROM SYSCAT.COLIDENTATTRIBUTES WHERE TABSCHEMA = ? AND TABNAME = ?`,
    params,
    "identity attributes"
  );
  const identities = new Map<string, IdentityMetadata>();
  for (const row of identityRows) {
    const columnName = requiredString(row, "column_name", "identity");
    if (identities.has(columnName)) {
      throw new Error(`Db2 returned duplicate identity metadata for column "${columnName}".`);
    }
    const cache = identityNumber(row, "cache", columnName);
    if (cache === null) {
      throw new Error(`Db2 identity cache metadata is missing for column "${columnName}".`);
    }
    identities.set(columnName, {
      mode: null,
      start: identityNumber(row, "start", columnName, true),
      increment: identityNumber(row, "increment", columnName, true),
      minValue: identityNumber(row, "min_value", columnName, true),
      maxValue: identityNumber(row, "max_value", columnName, true),
      cycle: requiredString(row, "cycle", columnName).trim(),
      cache,
      order: requiredString(row, "order", columnName).trim(),
    });
  }
  const columns: DdlColumn[] = columnsRows.map((row) => {
    const name = requiredString(row, "name", "column");
    const identityFlag = requiredString(row, "identity_flag", name).trim();
    const generated = nullableString(row, "generated");
    const identity = identities.get(name) || null;
    if (identityFlag !== "Y" && identityFlag !== "N") {
      throw new Error(`Db2 returned an unsupported identity flag for column "${name}".`);
    }
    if ((identityFlag === "Y") !== Boolean(identity)) {
      throw new Error(`Db2 identity catalog metadata is inconsistent for column "${name}".`);
    }
    if (identity && generated && !["A", "D"].includes(generated.trim())) {
      throw new Error(`Db2 identity generation mode is unsupported for column "${name}".`);
    }
    return {
      name,
      position: requiredNumber(row, "position", name),
      typeSchema: requiredString(row, "type_schema", name),
      typeName: requiredString(row, "type_name", name),
      length: requiredNumber(row, "length", name),
      scale: requiredNumber(row, "scale", name),
      stringUnits: nullableString(row, "string_units")?.trim() || null,
      stringUnitsLength:
        field(row, "string_units_length") === null ||
        field(row, "string_units_length") === undefined
          ? null
          : requiredNumber(row, "string_units_length", name),
      codepage: requiredNumber(row, "codepage", name),
      nullable: requiredString(row, "nullable", name).trim(),
      defaultValue: nullableString(row, "default_value"),
      identity: identity
        ? { ...identity, mode: generated ? generated.trim() : null }
        : null,
      identityFlag,
      generated: generated && generated.trim() ? generated.trim() : null,
      generatedExpression: nullableString(row, "generated_expression"),
      hidden: nullableString(row, "hidden")?.trim() || null,
      rowChangeTimestamp: requiredString(row, "row_change_timestamp", name).trim(),
    };
  });
  for (const name of identities.keys()) {
    if (!columns.some((column) => column.name === name)) {
      throw new Error(`Db2 returned identity metadata for missing column "${name}".`);
    }
  }
  const constraintRows = await queryRows(
    db,
    `SELECT CONSTNAME AS "name", TYPE AS "type", ENFORCED AS "enforced",
            TRUSTED AS "trusted", ENABLEQUERYOPT AS "optimize"
       FROM SYSCAT.TABCONST WHERE TABSCHEMA = ? AND TABNAME = ?
       ORDER BY TYPE, CONSTNAME`,
    params,
    "constraints"
  );
  const constraints = constraintRows.map((row) => ({
    name: requiredString(row, "name", "constraint"),
    type: requiredString(row, "type", "constraint"),
    enforced: requiredString(row, "enforced", "constraint").trim(),
    trusted: nullableString(row, "trusted")?.trim() || "",
    optimize: nullableString(row, "optimize")?.trim() || "",
  }));
  const keyRows = await queryRows(
    db,
    `SELECT CONSTNAME AS "constraint_name", COLNAME AS "column_name",
            COLSEQ AS "position"
       FROM SYSCAT.KEYCOLUSE WHERE TABSCHEMA = ? AND TABNAME = ?
       ORDER BY CONSTNAME, COLSEQ`,
    params,
    "key columns"
  );
  const keyColumns = keyRows.map((row) => ({
    constraintName: requiredString(row, "constraint_name", "key column"),
    columnName: requiredString(row, "column_name", "key column"),
    position: requiredNumber(row, "position", "key column"),
  }));

  const checkRows = await queryRows(
    db,
    `SELECT CONSTNAME AS "name", TEXT AS "text"
       FROM SYSCAT.CHECKS WHERE TABSCHEMA = ? AND TABNAME = ?
       ORDER BY CONSTNAME`,
    params,
    "check constraints"
  );
  const checks = checkRows.map((row) => ({
    name: requiredString(row, "name", "check constraint"),
    text: nullableString(row, "text"),
  }));

  const foreignRows = await queryRows(
    db,
    `SELECT R.CONSTNAME AS "name", R.REFTABSCHEMA AS "ref_schema",
            R.REFTABNAME AS "ref_table", R.REFKEYNAME AS "ref_key_name",
            R.DELETERULE AS "delete_rule", R.UPDATERULE AS "update_rule",
            R.COLCOUNT AS "column_count", FK.COLNAME AS "column_name",
            PK.COLNAME AS "ref_column_name", FK.COLSEQ AS "position"
       FROM SYSCAT.REFERENCES R
       LEFT JOIN SYSCAT.KEYCOLUSE FK
         ON FK.TABSCHEMA = R.TABSCHEMA AND FK.TABNAME = R.TABNAME
        AND FK.CONSTNAME = R.CONSTNAME
       LEFT JOIN SYSCAT.KEYCOLUSE PK
         ON PK.TABSCHEMA = R.REFTABSCHEMA AND PK.TABNAME = R.REFTABNAME
        AND PK.CONSTNAME = R.REFKEYNAME AND PK.COLSEQ = FK.COLSEQ
      WHERE R.TABSCHEMA = ? AND R.TABNAME = ?
      ORDER BY R.CONSTNAME, FK.COLSEQ`,
    params,
    "foreign keys"
  );
  const foreignKeyMap = new Map<string, DdlForeignKey>();
  for (const row of foreignRows) {
    const name = requiredString(row, "name", "foreign key");
    let foreignKey = foreignKeyMap.get(name);
    if (!foreignKey) {
      foreignKey = {
        name,
        refSchema: requiredString(row, "ref_schema", name),
        refTable: requiredString(row, "ref_table", name),
        refKeyName: requiredString(row, "ref_key_name", name),
        deleteRule: requiredString(row, "delete_rule", name).trim(),
        updateRule: requiredString(row, "update_rule", name).trim(),
        columnCount: requiredNumber(row, "column_count", name),
        columns: [],
      };
      foreignKeyMap.set(name, foreignKey);
    }
    const columnName = nullableString(row, "column_name");
    const refName = nullableString(row, "ref_column_name");
    if (columnName === null || refName === null) {
      throw new Error(`Db2 is missing dependent key-column metadata for foreign key "${name}".`);
    }
    foreignKey.columns.push({
      name: columnName,
      refName,
      position: requiredNumber(row, "position", name),
    });
  }

  const indexRows = await queryRows(
    db,
    `SELECT INDSCHEMA AS "schema", INDNAME AS "name",
            UNIQUERULE AS "unique_rule", INDEXTYPE AS "index_type",
            SYSTEM_REQUIRED AS "system_required", USER_DEFINED AS "user_defined",
            MADE_UNIQUE AS "made_unique", ENTRYTYPE AS "entry_type",
            COLCOUNT AS "column_count"
       FROM SYSCAT.INDEXES WHERE TABSCHEMA = ? AND TABNAME = ?
       ORDER BY INDSCHEMA, INDNAME`,
    params,
    "indexes"
  );
  const indexColumnRows = await queryRows(
    db,
    `SELECT C.INDSCHEMA AS "schema", C.INDNAME AS "index_name",
            C.COLNAME AS "column_name", C.COLSEQ AS "position", C.COLORDER AS "order",
            C.VIRTUAL AS "virtual", C.TEXT AS "expression",
            C.COLLATIONSCHEMA AS "collation_schema", C.COLLATIONNAME AS "collation_name"
       FROM SYSCAT.INDEXCOLUSE C
       JOIN SYSCAT.INDEXES I
         ON I.INDSCHEMA = C.INDSCHEMA AND I.INDNAME = C.INDNAME
      WHERE I.TABSCHEMA = ? AND I.TABNAME = ?
       ORDER BY C.INDSCHEMA, C.INDNAME, C.COLSEQ`,
    params,
    "index columns"
  );
  const dependencyRows = await queryRows(
    db,
    `SELECT D.CONSTNAME AS "constraint_name", C.TYPE AS "constraint_type",
            D.BSCHEMA AS "schema", D.BNAME AS "index_name"
       FROM SYSCAT.CONSTDEP D
       JOIN SYSCAT.TABCONST C
         ON C.TABSCHEMA = D.TABSCHEMA AND C.TABNAME = D.TABNAME
        AND C.CONSTNAME = D.CONSTNAME
      WHERE D.TABSCHEMA = ? AND D.TABNAME = ? AND D.BTYPE = 'I'
      ORDER BY D.CONSTNAME, D.BSCHEMA, D.BNAME`,
    params,
    "index dependencies"
  );
  const dependencies = new Map<string, string[]>();
  for (const row of dependencyRows) {
    const key = `${requiredString(row, "schema", "index dependency")}.${requiredString(
      row,
      "index_name",
      "index dependency"
    )}`;
    const constraintName = requiredString(row, "constraint_name", "index dependency");
    const constraintType = requiredString(row, "constraint_type", constraintName);
    if (constraintType !== "P" && constraintType !== "U") {
      throw new Error(
        `Db2 index "${key}" has a dependency from unsupported constraint "${constraintName}".`
      );
    }
    dependencies.set(key, [...(dependencies.get(key) || []), constraintType]);
  }
  const indexColumns = new Map<string, DdlIndexColumn[]>();
  for (const row of indexColumnRows) {
    const key = `${requiredString(row, "schema", "index column")}.${requiredString(
      row,
      "index_name",
      "index column"
    )}`;
    const columnsForIndex = indexColumns.get(key) || [];
    columnsForIndex.push({
      name: nullableString(row, "column_name") || "",
      position: requiredNumber(row, "position", key),
      order: requiredString(row, "order", key).trim(),
      virtual: nullableString(row, "virtual")?.trim() || null,
      expression: nullableString(row, "expression"),
      collationSchema: nullableString(row, "collation_schema"),
      collationName: nullableString(row, "collation_name"),
    });
    indexColumns.set(key, columnsForIndex);
  }
  const indexes = indexRows.map((row) => {
    const schema = requiredString(row, "schema", "index");
    const name = requiredString(row, "name", "index");
    const key = `${schema}.${name}`;
    const constraintNames = dependencies.get(key) || [];
    return {
      schema,
      name,
      uniqueRule: requiredString(row, "unique_rule", name).trim(),
      indexType: requiredString(row, "index_type", name).trim(),
      systemRequired: requiredNumber(row, "system_required", name),
      userDefined: requiredNumber(row, "user_defined", name),
      madeUnique: requiredString(row, "made_unique", name).trim(),
      entryType: nullableString(row, "entry_type")?.trim() || "",
      columnCount: requiredNumber(row, "column_count", name),
      columns: indexColumns.get(key) || [],
      backingConstraint:
        constraintNames.length === 0
          ? null
          : constraintNames.length === 1
          ? constraintNames[0]
          : (() => {
              if (new Set(constraintNames).size === 1) return constraintNames[0];
              throw new Error(`Db2 index "${schema}"."${name}" has ambiguous constraint dependencies.`);
            })(),
    };
  });
  for (const key of indexColumns.keys()) {
    if (!indexRows.some((row) => `${field(row, "schema")}.${field(row, "name")}` === key)) {
      throw new Error(`Db2 returned index columns without matching index metadata for "${key}".`);
    }
  }
  for (const key of dependencies.keys()) {
    if (!indexRows.some((row) => `${field(row, "schema")}.${field(row, "name")}` === key)) {
      throw new Error(`Db2 returned an index dependency without index metadata for "${key}".`);
    }
  }

  const grantRows = await queryRows(
    db,
    `SELECT GRANTEE AS "grantee", GRANTEETYPE AS "grantee_type",
            CONTROLAUTH AS "control", ALTERAUTH AS "alter", DELETEAUTH AS "delete",
            INDEXAUTH AS "index", INSERTAUTH AS "insert", REFAUTH AS "references",
            SELECTAUTH AS "select", UPDATEAUTH AS "update"
       FROM SYSCAT.TABAUTH WHERE TABSCHEMA = ? AND TABNAME = ?
       ORDER BY GRANTEETYPE, GRANTEE`,
    params,
    "table grants"
  );
  const grants = grantRows.map((row) => ({
    grantee: requiredString(row, "grantee", "table grant"),
    granteeType: requiredString(row, "grantee_type", "table grant").trim(),
    control: requiredString(row, "control", "table grant").trim(),
    privileges: {
      ALTER: requiredString(row, "alter", "table grant").trim(),
      DELETE: requiredString(row, "delete", "table grant").trim(),
      INDEX: requiredString(row, "index", "table grant").trim(),
      INSERT: requiredString(row, "insert", "table grant").trim(),
      REFERENCES: requiredString(row, "references", "table grant").trim(),
      SELECT: requiredString(row, "select", "table grant").trim(),
      UPDATE: requiredString(row, "update", "table grant").trim(),
    },
  }));

  return {
    table: {
      schema: table.schema,
      name: table.label,
      type: tableType,
      typeSchema,
      typeName,
    },
    columns,
    constraints,
    keyColumns,
    checks,
    foreignKeys: [...foreignKeyMap.values()],
    indexes,
    grants,
  };
}

function quoteIdentifier(identifier: string): string {
  if (!identifier) throw new Error("Db2 DDL cannot quote an empty identifier.");
  return `"${identifier.replace(/"/g, '""')}"`;
}

function quoteQualified(schema: string, name: string): string {
  return `${quoteIdentifier(schema)}.${quoteIdentifier(name)}`;
}

function integerLiteral(value: number, context: string): string {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Unsupported or invalid ${context} value "${value}".`);
  }
  return String(value);
}

function renderType(column: DdlColumn): string {
  if (column.typeSchema.trim() !== "SYSIBM") {
    throw new Error(
      `Column "${column.name}" uses unsupported distinct or user-defined type "${column.typeSchema}"."${column.typeName}".`
    );
  }
  const type = column.typeName.trim().toUpperCase();
  const length = integerLiteral(column.length, `length for column "${column.name}"`);
  const scale = integerLiteral(column.scale, `scale for column "${column.name}"`);
  const stringTypes: Record<string, boolean> = {
    CHAR: true,
    CHARACTER: true,
    VARCHAR: true,
    "LONG VARCHAR": true,
    CLOB: true,
    GRAPHIC: true,
    VARGRAPHIC: true,
    "LONG VARGRAPHIC": true,
    DBCLOB: true,
    BINARY: true,
    VARBINARY: true,
    BLOB: true,
  };
  if (stringTypes[type]) {
    if (column.length <= 0) throw new Error(`Column "${column.name}" has an invalid length.`);
    if (column.stringUnits !== null &&
        !["CODEUNITS16", "CODEUNITS32", "OCTETS"].includes(column.stringUnits)) {
      throw new Error(`Column "${column.name}" has unsupported string units "${column.stringUnits}".`);
    }
    if ((column.stringUnits === null) !== (column.stringUnitsLength === null)) {
      throw new Error(`Column "${column.name}" has incomplete string-unit metadata.`);
    }
    const logicalLength =
      column.stringUnits && column.stringUnitsLength !== null
        ? integerLiteral(column.stringUnitsLength, `string unit length for "${column.name}"`)
        : length;
    const units = column.stringUnits ? ` ${column.stringUnits}` : "";
    let result = `${type}(${logicalLength}${units})`;
    if (
      column.codepage === 0 &&
      ["CHAR", "CHARACTER", "VARCHAR", "LONG VARCHAR"].includes(type)
    ) {
      result += " FOR BIT DATA";
    }
    return result;
  }
  if (["DECIMAL", "NUMERIC", "DEC"].includes(type)) {
    if (column.length < 1 || column.length > 31 || column.scale < 0 || column.scale > column.length) {
      throw new Error(`Column "${column.name}" has unsupported DECIMAL precision or scale.`);
    }
    return `DECIMAL(${length}, ${scale})`;
  }
  if (type === "TIMESTAMP") {
    if (column.scale < 0 || column.scale > 12) {
      throw new Error(`Column "${column.name}" has unsupported TIMESTAMP precision.`);
    }
    return `TIMESTAMP(${scale})`;
  }
  if (type === "DECFLOAT") {
    if (column.length === 8) return "DECFLOAT(16)";
    if (column.length === 16) return "DECFLOAT(34)";
    throw new Error(`Column "${column.name}" has unsupported DECFLOAT precision.`);
  }
  if (type === "FLOAT") {
    if (column.length === 4) return "FLOAT(24)";
    if (column.length === 8) return "FLOAT(53)";
    throw new Error(`Column "${column.name}" has unsupported FLOAT precision.`);
  }
  const simpleTypes = new Set([
    "SMALLINT",
    "INTEGER",
    "INT",
    "BIGINT",
    "REAL",
    "DOUBLE",
    "DATE",
    "TIME",
    "BOOLEAN",
    "XML",
  ]);
  if (simpleTypes.has(type)) return type === "INT" ? "INTEGER" : type;
  throw new Error(`Column "${column.name}" uses unsupported Db2 built-in type "${column.typeName}".`);
}

function renderIdentity(identity: IdentityMetadata, columnName: string): string {
  if (identity.mode !== "A" && identity.mode !== "D") {
    throw new Error(
      `Db2 did not expose the identity generation mode for column "${columnName}"; refusing to change ALWAYS/BY DEFAULT semantics.`
    );
  }
  if (
    identity.start === null ||
    identity.increment === null ||
    identity.minValue === null ||
    identity.maxValue === null
  ) {
    throw new Error(`Db2 identity attributes are incomplete for column "${columnName}".`);
  }
  for (const [attribute, value] of [
    ["start", identity.start],
    ["increment", identity.increment],
    ["minvalue", identity.minValue],
    ["maxvalue", identity.maxValue],
  ]) {
    if (!/^[+-]?\d+$/.test(value || "")) {
      throw new Error(`Db2 identity ${attribute} is invalid for column "${columnName}".`);
    }
  }
  if (!["Y", "N"].includes(identity.cycle) || !["Y", "N"].includes(identity.order)) {
    throw new Error(`Db2 identity options are unsupported for column "${columnName}".`);
  }
  const cache = identity.cache;
  if (!/^\d+$/.test(cache)) {
    throw new Error(`Db2 returned an unsupported identity cache for column "${columnName}".`);
  }
  return `GENERATED ${identity.mode === "A" ? "ALWAYS" : "BY DEFAULT"} AS IDENTITY (` +
    `START WITH ${identity.start} INCREMENT BY ${identity.increment} ` +
    `MINVALUE ${identity.minValue} MAXVALUE ${identity.maxValue} ` +
    `${identity.cycle === "Y" ? "CYCLE" : "NO CYCLE"} ` +
    `${cache === "0" ? "NO CACHE" : `CACHE ${cache}`} ` +
    `${identity.order === "Y" ? "ORDER" : "NO ORDER"})`;
}

function renderColumn(column: DdlColumn): string {
  if (column.hidden) {
    throw new Error(`Hidden column "${column.name}" is not supported by logical Db2 DDL.`);
  }
  if (column.rowChangeTimestamp !== "N") {
    throw new Error(`Row-change timestamp column "${column.name}" is not supported by logical Db2 DDL.`);
  }
  if (column.identityFlag !== "Y" && column.identityFlag !== "N") {
    throw new Error(`Db2 returned an unsupported identity flag for column "${column.name}".`);
  }
  if ((column.identityFlag === "Y") !== Boolean(column.identity)) {
    throw new Error(`Db2 identity catalog metadata is inconsistent for column "${column.name}".`);
  }
  if (column.generated && !column.identity) {
    throw new Error(`Generated column "${column.name}" is not supported by logical Db2 DDL.`);
  }
  if (column.generatedExpression) {
    throw new Error(`Generated expression for column "${column.name}" is not supported.`);
  }
  if (column.identity && column.generated && !["A", "D"].includes(column.generated)) {
    throw new Error(`Identity generation mode for column "${column.name}" is unsupported.`);
  }
  if (column.identity && column.generated && column.identity.mode !== column.generated) {
    throw new Error(`Conflicting identity generation metadata for column "${column.name}".`);
  }
  if (column.nullable !== "Y" && column.nullable !== "N") {
    throw new Error(`Db2 returned an unsupported nullability flag for column "${column.name}".`);
  }
  const type = renderType(column);
  const identity = column.identity ? ` ${renderIdentity(column.identity, column.name)}` : "";
  if (column.defaultValue !== null && !column.defaultValue.trim()) {
    throw new Error(`Column "${column.name}" has an empty catalog default expression.`);
  }
  const defaultValue = column.defaultValue === null ? "" : ` DEFAULT ${column.defaultValue}`;
  const nullable = column.nullable === "N" ? " NOT NULL" : "";
  return `${quoteIdentifier(column.name)} ${type}${identity}${defaultValue}${nullable}`;
}

function keyColumnsFor(
  metadata: Db2TableMetadata,
  constraintName: string
): string[] {
  const rows = metadata.keyColumns
    .filter((row) => row.constraintName === constraintName)
    .sort((a, b) => a.position - b.position);
  if (rows.length === 0 || rows.some((row, index) => row.position !== index + 1)) {
    throw new Error(`Db2 key-column metadata is incomplete for constraint "${constraintName}".`);
  }
  return rows.map((row) => {
    if (!metadata.columns.some((column) => column.name === row.columnName)) {
      throw new Error(`Constraint "${constraintName}" refers to missing column "${row.columnName}".`);
    }
    return quoteIdentifier(row.columnName);
  });
}

function renderConstraintOptions(constraint: DdlConstraint): string {
  if (constraint.enforced !== "Y") {
    throw new Error(`Constraint "${constraint.name}" is not enforced; unsupported semantics.`);
  }
  if (constraint.trusted && constraint.trusted !== "Y") {
    throw new Error(`Constraint "${constraint.name}" has unsupported trust semantics.`);
  }
  if (constraint.optimize && constraint.optimize !== "Y") {
    throw new Error(`Constraint "${constraint.name}" has unsupported query-optimization semantics.`);
  }
  return "";
}

function renderConstraint(
  metadata: Db2TableMetadata,
  constraint: DdlConstraint
): string {
  renderConstraintOptions(constraint);
  const prefix = `CONSTRAINT ${quoteIdentifier(constraint.name)} `;
  if (constraint.type === "P" || constraint.type === "U") {
    return `${prefix}${constraint.type === "P" ? "PRIMARY KEY" : "UNIQUE"} ` +
      `(${keyColumnsFor(metadata, constraint.name).join(", ")})`;
  }
  if (constraint.type === "K") {
    const check = metadata.checks.find((candidate) => candidate.name === constraint.name);
    if (!check || !check.text || !check.text.trim()) {
      throw new Error(`Db2 check expression is missing for constraint "${constraint.name}".`);
    }
    return `${prefix}CHECK (${check.text.trim()})`;
  }
  if (constraint.type === "F") {
    const foreignKey = metadata.foreignKeys.find((candidate) => candidate.name === constraint.name);
    if (!foreignKey) throw new Error(`Db2 foreign-key metadata is missing for "${constraint.name}".`);
    const orderedColumns = foreignKey.columns
      .slice()
      .sort((a, b) => a.position - b.position);
    if (
      orderedColumns.length !== foreignKey.columnCount ||
      orderedColumns.some((column, index) => column.position !== index + 1)
    ) {
      throw new Error(`Db2 foreign-key columns are incomplete for "${constraint.name}".`);
    }
    const deleteRules: Record<string, string> = {
      A: "NO ACTION",
      C: "CASCADE",
      N: "SET NULL",
      R: "RESTRICT",
    };
    const updateRules: Record<string, string> = { A: "NO ACTION", R: "RESTRICT" };
    const deleteRule = deleteRules[foreignKey.deleteRule];
    const updateRule = updateRules[foreignKey.updateRule];
    if (!deleteRule || !updateRule) {
      throw new Error(`Db2 foreign-key rules are unsupported for "${constraint.name}".`);
    }
    const childColumns = orderedColumns.map((column) => {
      if (!metadata.columns.some((candidate) => candidate.name === column.name)) {
        throw new Error(`Foreign key "${constraint.name}" refers to missing column "${column.name}".`);
      }
      if (!column.refName) {
        throw new Error(`Foreign key "${constraint.name}" has missing referenced-column metadata.`);
      }
      return quoteIdentifier(column.name);
    });
    return `${prefix}FOREIGN KEY (${childColumns.join(", ")}) REFERENCES ` +
      `${quoteQualified(foreignKey.refSchema, foreignKey.refTable)} ` +
      `(${orderedColumns.map((column) => quoteIdentifier(column.refName)).join(", ")}) ` +
      `ON DELETE ${deleteRule} ON UPDATE ${updateRule}`;
  }
  throw new Error(
    `Constraint "${constraint.name}" has unsupported Db2 constraint type "${constraint.type}".`
  );
}

function renderIndex(
  index: DdlIndex,
  table: DdlTable,
  tableColumns: Set<string>
): string | null {
  if (index.backingConstraint) {
    const backing = index.backingConstraint;
    if (!["P", "U"].some((type) => type === backing)) {
      throw new Error(
        `Index "${index.schema}"."${index.name}" depends on unsupported constraint "${backing}".`
      );
    }
    if (index.userDefined !== 0) {
      throw new Error(
        `Constraint-backed index "${index.schema}"."${index.name}" was user-defined; its original dependency cannot be recreated safely.`
      );
    }
    return null;
  }
  if (index.indexType !== "REG" || index.entryType) {
    throw new Error(`Index "${index.schema}"."${index.name}" has unsupported kind "${index.indexType}".`);
  }
  if (index.systemRequired !== 0 || index.uniqueRule === "P") {
    throw new Error(`Index "${index.schema}"."${index.name}" has an unsupported system dependency.`);
  }
  if (!["D", "U"].includes(index.uniqueRule)) {
    throw new Error(`Index "${index.schema}"."${index.name}" has unsupported uniqueness metadata.`);
  }
  if (index.columns.length === 0 || index.columns.length !== index.columnCount) {
    throw new Error(`Db2 index-column metadata is incomplete for "${index.schema}"."${index.name}".`);
  }
  const ordered = index.columns.slice().sort((a, b) => a.position - b.position);
  if (ordered.some((column, position) => column.position !== position + 1)) {
    throw new Error(`Db2 index-column order is incomplete for "${index.schema}"."${index.name}".`);
  }
  const keys: string[] = [];
  const includes: string[] = [];
  for (const column of ordered) {
    if (
      (column.virtual !== null && column.virtual !== "N") ||
      column.expression !== null ||
      column.collationSchema !== null ||
      column.collationName !== null
    ) {
      throw new Error(
        `Index "${index.schema}"."${index.name}" contains an expression, virtual, or collated key that is not supported.`
      );
    }
    if (!column.name || !column.name.trim() || !tableColumns.has(column.name)) {
      throw new Error(`Db2 index "${index.schema}"."${index.name}" has an invalid column name.`);
    }
    if (column.order === "A" || column.order === "D") {
      keys.push(`${quoteIdentifier(column.name)} ${column.order === "A" ? "ASC" : "DESC"}`);
    } else if (column.order === "I") {
      includes.push(quoteIdentifier(column.name));
    } else {
      throw new Error(
        `Index "${index.schema}"."${index.name}" has unsupported column ordering "${column.order}".`
      );
    }
  }
  if (keys.length === 0) {
    throw new Error(`Db2 index "${index.schema}"."${index.name}" has no key columns.`);
  }
  return `CREATE ${index.uniqueRule === "U" ? "UNIQUE " : ""}INDEX ` +
    `${quoteQualified(index.schema, index.name)} ON ${quoteQualified(table.schema, table.name)} ` +
    `(${keys.join(", ")})${includes.length ? ` INCLUDE (${includes.join(", ")})` : ""};`;
}

function renderGrants(grants: DdlGrant[], table: DdlTable): string[] {
  const statements = new Set<string>();
  const grantee = (grant: DdlGrant) => {
    if (grant.granteeType === "U") return `USER ${quoteIdentifier(grant.grantee)}`;
    if (grant.granteeType === "G") return `GROUP ${quoteIdentifier(grant.grantee)}`;
    if (grant.granteeType === "R") return `ROLE ${quoteIdentifier(grant.grantee)}`;
    if (grant.grantee === "PUBLIC" &&
        (grant.granteeType === "P" || grant.granteeType === "U")) return "PUBLIC";
    throw new Error(
      `Db2 grant has unsupported grantee type "${grant.granteeType}" for "${grant.grantee}".`
    );
  };
  for (const grant of grants) {
    const target = grantee(grant);
    if (grant.control !== "N") {
      if (grant.control !== "Y") {
        throw new Error(`Db2 CONTROL privilege for "${grant.grantee}" has unsupported grantability.`);
      }
      statements.add(`GRANT CONTROL ON TABLE ${quoteQualified(table.schema, table.name)} TO ${target};`);
    }
    for (const [privilege, flag] of Object.entries(grant.privileges)) {
      if (flag === "N") continue;
      if (flag !== "Y" && flag !== "G") {
        throw new Error(
          `Db2 ${privilege} privilege for "${grant.grantee}" has unsupported flag "${flag}".`
        );
      }
      statements.add(
        `GRANT ${privilege} ON TABLE ${quoteQualified(table.schema, table.name)} TO ${target}` +
          `${flag === "G" ? " WITH GRANT OPTION" : ""};`
      );
    }
  }
  return [...statements].sort();
}

export function renderTableDDL(metadata: Db2TableMetadata): string {
  if (!metadata || !metadata.table || metadata.table.type !== "T") {
    throw new Error("Db2 DDL requires metadata for an ordinary base table.");
  }
  if (!metadata.columns.length) throw new Error("Db2 table metadata contains no columns.");
  if (new Set(metadata.columns.map((column) => column.position)).size !== metadata.columns.length) {
    throw new Error("Db2 column positions are duplicated.");
  }
  const orderedColumns = metadata.columns.slice().sort((a, b) => a.position - b.position);
  if (
    orderedColumns.some((column, index) => column.position !== index)
  ) {
    throw new Error("Db2 column positions are incomplete or not ordered from zero.");
  }
  const columns = orderedColumns.map(renderColumn);
  if (new Set(metadata.constraints.map((constraint) => constraint.name)).size !== metadata.constraints.length) {
    throw new Error("Db2 constraint names are duplicated.");
  }
  const constraintTypes = new Set(["P", "U", "K", "F"]);
  for (const constraint of metadata.constraints) {
    if (!constraintTypes.has(constraint.type)) {
      throw new Error(
        `Constraint "${constraint.name}" has unsupported Db2 constraint type "${constraint.type}".`
      );
    }
  }
  const constraintsByName = new Map(
    metadata.constraints.map((constraint) => [constraint.name, constraint])
  );
  for (const keyColumn of metadata.keyColumns) {
    const constraint = constraintsByName.get(keyColumn.constraintName);
    if (!constraint || !["P", "U", "F"].includes(constraint.type)) {
      throw new Error(
        `Db2 returned key-column metadata without a matching key constraint "${keyColumn.constraintName}".`
      );
    }
  }
  for (const check of metadata.checks) {
    if (!constraintsByName.has(check.name) || constraintsByName.get(check.name)?.type !== "K") {
      throw new Error(`Db2 returned check text without a matching check constraint "${check.name}".`);
    }
  }
  for (const foreignKey of metadata.foreignKeys) {
    if (!constraintsByName.has(foreignKey.name) || constraintsByName.get(foreignKey.name)?.type !== "F") {
      throw new Error(
        `Db2 returned foreign-key metadata without a matching constraint "${foreignKey.name}".`
      );
    }
  }
  const typeOrder: Record<string, number> = { P: 0, U: 1, K: 2, F: 3 };
  const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const columnNames = new Set(metadata.columns.map((column) => column.name));
  const constraints = metadata.constraints
    .slice()
    .sort((a, b) => typeOrder[a.type] - typeOrder[b.type] || compareText(a.name, b.name))
    .map((constraint) => renderConstraint(metadata, constraint));
  const createTable = `CREATE TABLE ${quoteQualified(metadata.table.schema, metadata.table.name)} (\n  ` +
    [...columns, ...constraints].join(",\n  ") +
    "\n);";
  const indexes = metadata.indexes
    .slice()
    .sort((a, b) => compareText(a.schema, b.schema) || compareText(a.name, b.name))
    .map((index) => renderIndex(index, metadata.table, columnNames))
    .filter((statement): statement is string => statement !== null);
  const grants = renderGrants(metadata.grants, metadata.table);
  const header =
    "-- Logical Db2 LUW DDL; physical attributes, triggers, data, and column grants are excluded.\n" +
    "-- Referenced tables and principals must already exist. This script is not executed automatically.";
  const sections = [header, createTable];
  if (indexes.length > 0) sections.push(indexes.join("\n"));
  if (grants.length > 0) sections.push(grants.join("\n"));
  return sections.join("\n\n") + "\n";
}

export async function generateDb2TableDDL(
  db: DdlConnection,
  table: NSDatabase.ITable
): Promise<string> {
  const metadata = await loadDb2TableMetadata(db, table);
  return renderTableDDL(metadata);
}
