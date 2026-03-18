const test = require('node:test');
const assert = require('node:assert/strict');

const { formatStatusBarText } = require('./quotaClient');

test('formatStatusBarText uses the yls prefix', () => {
  assert.equal(formatStatusBarText(128), 'yls 128');
});

test('formatStatusBarText preserves fallback formatting for missing quota', () => {
  assert.equal(formatStatusBarText(null), 'yls --');
});
