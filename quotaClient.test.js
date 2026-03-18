const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { formatStatusBarText } = require('./quotaClient');

test('formatStatusBarText uses the yls prefix', () => {
  assert.equal(formatStatusBarText(128), 'yls 128');
});

test('formatStatusBarText preserves fallback formatting for missing quota', () => {
  assert.equal(formatStatusBarText(null), 'yls --');
});

test('extension UI does not contain the old YSL Quota label', () => {
  const extensionSource = fs.readFileSync(path.join(__dirname, 'extension.js'), 'utf8');
  assert.equal(extensionSource.includes('YSL Quota'), false);
  assert.equal(extensionSource.includes('YLS Quota'), true);
});
