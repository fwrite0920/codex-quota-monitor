const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  buildQuotaViewModel,
  extractQuotaInfo,
  formatStatusBarText,
} = require('./quotaClient');

test('formatStatusBarText uses the yls prefix', () => {
  assert.equal(formatStatusBarText(128), 'yls 128');
});

test('formatStatusBarText preserves fallback formatting for missing quota', () => {
  assert.equal(formatStatusBarText(null), 'yls --');
});

test('extractQuotaInfo reads weekly quota details from the API state payload', () => {
  const info = extractQuotaInfo({
    state: {
      userPackgeUsage: {
        remaining_quota: 128,
        used_percentage: 22,
      },
      userPackgeUsage_week: {
        total_quota: 80,
        remaining_quota: 31,
        used_percentage: '61.25',
      },
    },
  });

  assert.equal(info.remainingQuota, 128);
  assert.equal(info.packageUsage, 22);
  assert.equal(info.weeklyRemainingQuota, 31);
  assert.equal(info.weeklyPackageUsage, '61.25');
  assert.deepEqual(info.weeklyPackageUsageDetails, {
    total_quota: 80,
    remaining_quota: 31,
    used_percentage: '61.25',
  });
});

test('buildQuotaViewModel formats weekly quota values with fallbacks', () => {
  const viewModel = buildQuotaViewModel({
    packageUsageDetails: {},
    weeklyPackageUsageDetails: {
      total_quota: 0,
      remaining_quota: null,
      used_percentage: '37.5',
    },
    fetchedAt: new Date('2026-03-24T05:06:07Z'),
  });

  assert.equal(viewModel.weeklyRemainingText, '--');
  assert.equal(viewModel.weeklyPackageUsageText, '37.5%');
  assert.equal(viewModel.weeklyProgressText, '37.5%');
  assert.deepEqual(viewModel.weeklySummaryMetrics, [
    { label: '周总额度', value: '0' },
  ]);
});

test('extension UI does not contain the old YSL Quota label', () => {
  const extensionSource = fs.readFileSync(path.join(__dirname, 'extension.js'), 'utf8');
  assert.equal(extensionSource.includes('YSL Quota'), false);
  assert.equal(extensionSource.includes('YLS Quota'), true);
});

test('extension UI includes weekly quota labels and tooltip copy', () => {
  const extensionSource = fs.readFileSync(path.join(__dirname, 'extension.js'), 'utf8');
  const quotaClientSource = fs.readFileSync(path.join(__dirname, 'quotaClient.js'), 'utf8');

  assert.equal(extensionSource.includes('周剩余额度'), true);
  assert.equal(extensionSource.includes('周使用率'), true);
  assert.equal(quotaClientSource.includes('周总额度'), true);
  assert.equal(extensionSource.includes('Weekly remaining quota:'), true);
  assert.equal(extensionSource.includes('Weekly usage:'), true);
});
