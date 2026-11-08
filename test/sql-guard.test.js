const assert = require('node:assert/strict');
const { test } = require('node:test');
const Db2Driver = require('../out/ls/driver').default;

const block = sql => {
  if (/drop\s+table|update/i.test(sql)) throw new Error('SQL execution blocked');
};

test('Db2 validates the entire script before opening the connection', async () => {
  const driver = new Db2Driver({ id: 'test', name: 'test', driver: 'DB2' }, async () => []);
  let opened = false;
  driver.open = async () => { opened = true; };
  driver.setSqlExecutionGuard(block);
  await assert.rejects(driver.query('SELECT 1; DROP TABLE prod.users', {}), /SQL execution blocked/);
  assert.equal(opened, false);
});

test('Db2 preflights all grid updates before starting a transaction', async () => {
  const driver = new Db2Driver({ id: 'test', name: 'test', driver: 'DB2' }, async () => []);
  let began = false;
  driver.open = async () => ({ beginTransaction: async () => { began = true; } });
  driver.setSqlExecutionGuard(block);
  const result = await driver.applyEdits([{ table: { schema: 'S', label: 'T' }, primaryKey: { ID: 1 }, changes: { NAME: 'x' } }]);
  assert.equal(result.success, false);
  assert.match(result.error, /SQL execution blocked/);
  assert.equal(began, false);
});

test('Db2 guards generated database queries and prepares', () => {
  const driver = new Db2Driver({ id: 'test', name: 'test', driver: 'DB2' }, async () => []);
  let calls = 0;
  const db = driver.guardDatabase({ query() { calls++; }, prepare() { calls++; } });
  driver.setSqlExecutionGuard(block);
  assert.throws(() => db.query({ sql: 'DROP TABLE prod.users' }), /blocked/);
  assert.throws(() => db.prepare('UPDATE T SET C = ?'), /blocked/);
  assert.equal(calls, 0);
});
