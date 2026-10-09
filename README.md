# Db2 Driver for SQLTools

Built and maintained by

- Lucas Hancock (lucas.hancock18@gmail.com)

## Supported (Tested) Architectures

- macOS Silicon
- Windows 10
- macOS Intel not natively supported

## Installing and Running

The driver depends on node package ibm_db. For supported architectures above, this package will prompt you to install upon first use. For macOS Silicon, it will be installed in the following directory:

`$HOME/Library/Application Support/vscode-sqltools`

For Windows machines, it will be installed in the following directory:

`C:\Users\<username>\AppData\Local\vscode-sqltools\Data`

You may also be prompted to enable a setting within SQLTools to acknowledge node runtime. Please select to enable. This is required for the driver to work. The purpose of this is to look on your machine for an up to date version of node to use as the runtime. The extension was built on the latest stable version of node (v23.4.0).

## Issues

Please submit any issues to: [github issues](https://github.com/lucashancock/db2-sqltools/issues)

## Requirements

- VS Code (tested 1.96.0)
- node (tested v23.4.0)
- npm (tested v10.9.2)
- make
- gcc
- g++
- Linux: libxcrypt-compat
- Mac/Linux: libcrypt

**See [npm ibm_db page](https://github.com/lucashancock/db2-sqltools/blob/HEAD/npmjs.com/package/ibm_db) for more documentation about prerequisites**

## Generate DDL

The SQLTools **Generate DDL** command creates a logical SQL script for an ordinary Db2 LUW base table. The script opens in a new, unsaved SQL editor and is not executed.

The export includes built-in column types, catalog defaults and nullability, primary and unique keys, enforced check and foreign-key constraints, regular standalone ascending/descending indexes (including supported `INCLUDE` columns), and visible table-level grants. Catalog reads are parameterized, sequential, and unpaged. Table and schema identifiers are kept in catalog case and delimited with escaped double quotes.

The export is not a `db2look` backup or a physical recovery script. It excludes storage, tablespace and partitioning attributes, triggers, data, and column-level grants. Column-level grants are not queried or recreated; their omission is disclosed in the generated SQL header. Temporal tables (application/system periods) and tables with any row permission or column mask in `SYSCAT.CONTROLS` are rejected, including disabled security-control definitions. Referenced tables and principals must exist before replaying the script. Grantor identity and current identity-sequence state are not recreated.

Unsupported table, type, constraint, index, and grant metadata fails generation rather than producing a partial script. Identity mode is read from `SYSCAT.COLUMNS.GENERATED` together with `IDENTITY`, and identity sequence options are read from `SYSCAT.COLIDENTATTRIBUTES`; large identity values are retained as decimal text. Generated-expression text, hidden columns, and row-change timestamp columns are detected from `SYSCAT.COLUMNS` and rejected explicitly because they are not implemented as logical DDL.

The regression tests use mocked catalog rows. No live Db2 replay or scratch-schema comparison has been performed.

## FAQ

WIP

## Contact

- Lucas Hancock (lucas.hancock18@gmail.com)

## Contributing & Development Environment

1. Clone the github repository
2. Refer to the contributing docs on SQLTools website to get started
3. Run `npm i` to install dependencies.
4. Run `npm run watch` to compile in watch mode or `npm run compile` to compile.
5. Press F5 while on src code tab to start Extension Development Host, or navigate to run and debug menu and run from there.
6. Have fun!
