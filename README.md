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
