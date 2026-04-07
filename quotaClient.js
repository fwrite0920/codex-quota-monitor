const https = require('node:https');

const DEFAULT_ENDPOINT = 'https://codex.ylsagi.com/codex/info';

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getPackageUsageSource(payload) {
  return payload.state?.userPackgeUsage ?? payload.state?.userPackageUsage ?? null;
}

function getWeeklyPackageUsageSource(payload) {
  return payload.state?.userPackgeUsage_week
    ?? payload.state?.userPackageUsage_week
    ?? payload.state?.userPackgeUsageWeek
    ?? payload.state?.userPackageUsageWeek
    ?? null;
}

function extractQuotaInfo(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid response payload');
  }

  const packageUsageSource = getPackageUsageSource(payload);
  const packageUsageDetails = isRecord(packageUsageSource) ? packageUsageSource : null;
  const weeklyPackageUsageSource = getWeeklyPackageUsageSource(payload);
  const weeklyPackageUsageDetails = isRecord(weeklyPackageUsageSource) ? weeklyPackageUsageSource : null;
  const remainingQuota = packageUsageDetails?.remaining_quota ?? payload.remaining_quota ?? null;
  const packageUsage = packageUsageDetails?.used_percentage ?? packageUsageSource ?? null;
  const weeklyRemainingQuota = weeklyPackageUsageDetails?.remaining_quota ?? null;
  const weeklyPackageUsage = weeklyPackageUsageDetails?.used_percentage ?? weeklyPackageUsageSource ?? null;

  if (remainingQuota === null && packageUsage === null) {
    throw new Error('Response did not contain remaining_quota or userPackgeUsage');
  }

  return {
    remainingQuota,
    packageUsage,
    packageUsageDetails,
    weeklyRemainingQuota,
    weeklyPackageUsage,
    weeklyPackageUsageDetails,
  };
}

function formatValue(value) {
  if (value === null || value === undefined || value === '') {
    return '--';
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

function formatInteger(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return '--';
  }

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(numericValue);
}

function formatMoney(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return '--';
  }

  return `$${numericValue.toFixed(4)}`;
}

function formatQuotaText(remainingQuota) {
  return `Quota ${formatValue(remainingQuota)}`;
}

function formatStatusBarText(remainingQuota) {
  return `yls ${formatValue(remainingQuota)}`;
}

function formatPackageUsage(packageUsage) {
  const numericUsage = Number(packageUsage);
  if (Number.isFinite(numericUsage)) {
    return `${numericUsage}%`;
  }

  return formatValue(packageUsage);
}

function getUsageTone(progressPercent) {
  const numericProgress = Number(progressPercent);
  if (!Number.isFinite(numericProgress)) {
    return {
      level: 'normal',
      accent: '#2f81f7',
      accentSoft: 'rgba(47, 129, 247, 0.18)',
    };
  }

  if (numericProgress >= 80) {
    return {
      level: 'danger',
      accent: '#f85149',
      accentSoft: 'rgba(248, 81, 73, 0.18)',
    };
  }

  if (numericProgress >= 60) {
    return {
      level: 'warning',
      accent: '#d29922',
      accentSoft: 'rgba(210, 153, 34, 0.18)',
    };
  }

  return {
    level: 'normal',
    accent: '#2f81f7',
    accentSoft: 'rgba(47, 129, 247, 0.18)',
  };
}

function isWarningLevel(remainingQuota, threshold) {
  const numericQuota = Number(remainingQuota);
  return Number.isFinite(numericQuota) && numericQuota <= threshold;
}

function parseApiResponse(statusCode, body) {
  let payload;
  try {
    payload = JSON.parse(body);
  } catch (error) {
    throw new Error(`Invalid JSON response: ${error.message}`);
  }

  if (statusCode < 200 || statusCode >= 300) {
    const detail = payload?.message || body.trim() || 'unknown error';
    throw new Error(`API request failed (${statusCode}): ${detail}`);
  }

  return {
    ...extractQuotaInfo(payload),
    rawState: payload.state ?? {},
  };
}

function formatTime(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '--';
  }

  const pad = value => String(value).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function buildQuotaViewModel(info) {
  const details = info?.packageUsageDetails ?? {};
  const weeklyDetails = info?.weeklyPackageUsageDetails ?? {};
  const packageUsage = details.used_percentage ?? info?.packageUsage;
  const remainingQuota = details.remaining_quota ?? info?.remainingQuota;
  const weeklyPackageUsage = weeklyDetails.used_percentage ?? info?.weeklyPackageUsage;
  const weeklyRemainingQuota = weeklyDetails.remaining_quota ?? info?.weeklyRemainingQuota;
  const numericUsage = Number(packageUsage);
  const progressPercent = Number.isFinite(numericUsage)
    ? Math.max(0, Math.min(100, numericUsage))
    : 0;
  const numericWeeklyUsage = Number(weeklyPackageUsage);

  return {
    remainingText: formatValue(remainingQuota),
    packageUsageText: formatPackageUsage(packageUsage),
    progressText: Number.isFinite(numericUsage) ? `${numericUsage}%` : '--',
    weeklyRemainingText: formatValue(weeklyRemainingQuota),
    weeklyPackageUsageText: formatPackageUsage(weeklyPackageUsage),
    weeklyProgressText: Number.isFinite(numericWeeklyUsage) ? `${numericWeeklyUsage}%` : '--',
    progressPercent,
    tone: getUsageTone(progressPercent),
    updatedText: formatTime(info?.fetchedAt),
    summaryMetrics: [
      { label: '总额度', value: formatValue(details.total_quota) },
      { label: '总成本', value: formatMoney(details.total_cost) },
      { label: '总 Tokens', value: formatInteger(details.total_tokens) },
    ],
    weeklySummaryMetrics: [
      { label: '周总额度', value: formatValue(weeklyDetails.total_quota) },
    ],
    secondaryMetrics: [
      { label: '缓存命中', value: formatInteger(details.input_tokens_cached) },
      { label: '推理输出', value: formatInteger(details.output_tokens_reasoning) },
    ],
    costBreakdownText: [
      `输入 ${formatMoney(details.input_cost)}`,
      `输出 ${formatMoney(details.output_cost)}`,
      `缓存 ${formatMoney(details.cache_read_cost)}`,
    ].join(' · '),
  };
}

function fetchQuotaInfo(apiKey, endpoint = DEFAULT_ENDPOINT) {
  const trimmedKey = apiKey?.trim();
  if (!trimmedKey) {
    return Promise.reject(new Error('API key is missing'));
  }

  return new Promise((resolve, reject) => {
    const request = https.request(
      endpoint,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${trimmedKey}`,
          'User-Agent': 'CodexQuotaMonitorVSCode/1.0',
        },
      },
      response => {
        let body = '';

        response.setEncoding('utf8');
        response.on('data', chunk => {
          body += chunk;
        });
        response.on('end', () => {
          try {
            const parsed = parseApiResponse(response.statusCode ?? 0, body);
            resolve({
              ...parsed,
              fetchedAt: new Date(),
            });
          } catch (error) {
            reject(error);
          }
        });
      },
    );

    request.on('error', reject);
    request.setTimeout(10000, () => {
      request.destroy(new Error('Request timed out after 10 seconds'));
    });
    request.end();
  });
}

module.exports = {
  buildQuotaViewModel,
  DEFAULT_ENDPOINT,
  extractQuotaInfo,
  fetchQuotaInfo,
  formatPackageUsage,
  formatQuotaText,
  formatStatusBarText,
  getUsageTone,
  isWarningLevel,
  parseApiResponse,
};
