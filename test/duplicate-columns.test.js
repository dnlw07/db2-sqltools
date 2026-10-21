const assert = require('node:assert/strict');
const { test } = require('node:test');
const { uniqueColumnLabels } = require('../out/ls/driver');

test('repeated result names get unique labels', () => {
  assert.deepEqual(uniqueColumnLabels(['NAME', 'ID', 'NAME', 'EMAIL']), ['NAME', 'ID', 'NAME (1)', 'EMAIL']);
});

test('labels do not collide with existing column names', () => {
  assert.deepEqual(uniqueColumnLabels(['A', 'A', 'A (1)']), ['A', 'A (2)', 'A (1)']);
});

test('unique names are left unchanged', () => {
  assert.deepEqual(uniqueColumnLabels(['A', 'B']), ['A', 'B']);
});
