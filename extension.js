const vscode = require('vscode');
const {
  buildQuotaViewModel,
  DEFAULT_ENDPOINT,
  fetchQuotaInfo,
  formatPackageUsage,
  formatStatusBarText,
} = require('./quotaClient');

const EXTENSION_ID = 'ylsagi.codex-quota-monitor';
const API_KEY_SECRET = 'codexQuotaMonitor.apiKey';
const REFRESH_COMMAND = 'codexQuotaMonitor.refresh';
const SET_KEY_COMMAND = 'codexQuotaMonitor.setApiKey';
const CLEAR_KEY_COMMAND = 'codexQuotaMonitor.clearApiKey';
const OPEN_PANEL_COMMAND = 'codexQuotaMonitor.openPanel';
const SET_INTERVAL_COMMAND = 'codexQuotaMonitor.setRefreshInterval';

function activate(context) {
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  const state = {
    refreshTimer: undefined,
    lastInfo: undefined,
    refreshInFlight: false,
    panel: undefined,
  };

  context.subscriptions.push(statusBarItem);
  context.subscriptions.push({
    dispose() {
      if (state.refreshTimer) {
        clearInterval(state.refreshTimer);
      }
    },
  });

  async function getApiKey() {
    return context.secrets.get(API_KEY_SECRET);
  }

  function getConfig() {
    return vscode.workspace.getConfiguration('codexQuotaMonitor');
  }

  function getEndpoint() {
    return getConfig().get('apiEndpoint', DEFAULT_ENDPOINT);
  }

  function getRefreshIntervalMs() {
    const minutes = Math.max(1, getConfig().get('refreshIntervalMinutes', 5));
    return minutes * 60 * 1000;
  }

  function updatePanel() {
    if (!state.panel) {
      return;
    }

    state.panel.webview.html = getPanelHtml();
  }

  function setStatusBarIdle(message) {
    statusBarItem.text = message;
    statusBarItem.tooltip = 'Click to open Codex quota details';
    statusBarItem.backgroundColor = undefined;
    statusBarItem.command = OPEN_PANEL_COMMAND;
    statusBarItem.show();
    updatePanel();
  }

  function renderInfo(info) {
    const viewModel = buildQuotaViewModel(info);
    state.lastInfo = info;
    statusBarItem.text = formatStatusBarText(info.remainingQuota);
    statusBarItem.command = OPEN_PANEL_COMMAND;
    statusBarItem.backgroundColor = viewModel.tone.level === 'danger'
      ? new vscode.ThemeColor('statusBarItem.errorBackground')
      : viewModel.tone.level === 'warning'
        ? new vscode.ThemeColor('statusBarItem.warningBackground')
        : undefined;

    const updatedAt = info.fetchedAt instanceof Date ? info.fetchedAt.toLocaleString() : 'never';
    statusBarItem.tooltip = [
      `Remaining quota: ${viewModel.remainingText}`,
      `Package usage: ${viewModel.packageUsageText}`,
      `Updated: ${updatedAt}`,
      'Click to refresh',
      'Use Command Palette: Codex Quota Monitor',
    ].join('\n');
    statusBarItem.show();
    updatePanel();
  }

  function renderError(message) {
    statusBarItem.text = 'Quota err';
    statusBarItem.command = OPEN_PANEL_COMMAND;
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    statusBarItem.tooltip = [
      `Error: ${message}`,
      state.lastInfo
        ? `Last known quota: ${state.lastInfo.remainingQuota ?? '--'}`
        : 'No successful refresh yet',
      'Click to retry',
    ].join('\n');
    statusBarItem.show();
    updatePanel();
  }

  async function refresh() {
    if (state.refreshInFlight) {
      return;
    }

    const apiKey = await getApiKey();
    if (!apiKey) {
      setStatusBarIdle('Quota key?');
      statusBarItem.tooltip = 'Click to save your Codex API key';
      updatePanel();
      return;
    }

    state.refreshInFlight = true;
    statusBarItem.text = 'Quota ...';
    statusBarItem.tooltip = 'Refreshing Codex quota';
    statusBarItem.command = REFRESH_COMMAND;
    statusBarItem.backgroundColor = undefined;
    statusBarItem.show();
    updatePanel();

    try {
      const info = await fetchQuotaInfo(apiKey, getEndpoint());
      renderInfo(info);
    } catch (error) {
      renderError(error.message);
    } finally {
      state.refreshInFlight = false;
    }
  }

  async function setApiKey() {
    const value = await vscode.window.showInputBox({
      prompt: 'Enter your Codex API key',
      password: true,
      ignoreFocusOut: true,
      placeHolder: 'yls-...',
    });

    if (!value) {
      return;
    }

    const trimmedValue = value.trim();
    if (!trimmedValue) {
      vscode.window.showWarningMessage('API key cannot be empty');
      return;
    }

    await context.secrets.store(API_KEY_SECRET, trimmedValue);
    vscode.window.showInformationMessage('Codex API key saved');
    await refresh();
  }

  async function clearApiKey() {
    await context.secrets.delete(API_KEY_SECRET);
    state.lastInfo = undefined;
    setStatusBarIdle('Quota key?');
    vscode.window.showInformationMessage('Codex API key cleared');
  }

  async function setRefreshInterval() {
    const currentValue = getConfig().get('refreshIntervalMinutes', 5);
    const value = await vscode.window.showInputBox({
      prompt: 'Set refresh interval in minutes',
      ignoreFocusOut: true,
      value: String(currentValue),
      validateInput(input) {
        const numericValue = Number(input);
        if (!Number.isFinite(numericValue) || numericValue < 1) {
          return 'Enter a number greater than or equal to 1';
        }

        return null;
      },
    });

    if (!value) {
      return;
    }

    await getConfig().update(
      'refreshIntervalMinutes',
      Number(value),
      vscode.ConfigurationTarget.Global,
    );
    vscode.window.showInformationMessage(`Refresh interval set to ${value} minute(s)`);
  }

  function getPanelHtml() {
    const viewModel = buildQuotaViewModel(state.lastInfo);
    const hasInfo = Boolean(state.lastInfo);
    const statusText = state.refreshInFlight
      ? '正在刷新...'
      : hasInfo
        ? '点击下方按钮可立即刷新'
        : '请先设置 API Key';
    const summaryMarkup = viewModel.summaryMetrics
      .map(metric => `
        <div class="metric-card">
          <div class="metric-label">${metric.label}</div>
          <div class="metric-value">${metric.value}</div>
        </div>`)
      .join('');
    const secondaryMarkup = viewModel.secondaryMetrics
      .map(metric => `
        <div class="mini-stat">
          <span class="mini-label">${metric.label}</span>
          <span class="mini-value">${metric.value}</span>
        </div>`)
      .join('');

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    :root {
      color-scheme: dark;
      --bg: #171819;
      --panel: #202224;
      --panel-highlight: #26292b;
      --text: #ececec;
      --muted: #9ea4aa;
      --border: rgba(255, 255, 255, 0.08);
      --track: rgba(255, 255, 255, 0.1);
      --accent: ${viewModel.tone.accent};
      --accent-soft: ${viewModel.tone.accentSoft};
      --danger: #ff5f56;
      --button: #272a2d;
      --button-hover: #303438;
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 14px;
      background: var(--bg);
      color: var(--text);
      font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .shell {
      max-width: 360px;
      margin: 0 auto;
    }
    .card {
      background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015));
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 14px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.24);
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }
    .title {
      font-size: 15px;
      font-weight: 600;
      letter-spacing: 0.15px;
    }
    .badge {
      padding: 3px 9px;
      border-radius: 999px;
      background: var(--accent-soft);
      color: #d7e7ff;
      font-size: 11px;
      font-weight: 600;
    }
    .section {
      padding: 10px 0;
      border-top: 1px solid var(--border);
    }
    .section:first-of-type {
      border-top: 0;
      padding-top: 0;
    }
    .row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
      margin: 7px 0;
    }
    .label {
      color: var(--muted);
    }
    .value {
      font-variant-numeric: tabular-nums;
      font-weight: 600;
      text-align: right;
    }
    .value.progress-value {
      color: var(--accent);
    }
    .progress {
      margin-top: 12px;
    }
    .progress-bar {
      height: 6px;
      width: 100%;
      overflow: hidden;
      border-radius: 999px;
      background: var(--track);
    }
    .progress-fill {
      height: 100%;
      width: ${viewModel.progressPercent}%;
      border-radius: 999px;
      background: linear-gradient(90deg, var(--accent), #5ea1ff);
    }
    .status {
      margin-top: 8px;
      color: var(--muted);
      font-size: 12px;
    }
    .metric-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      margin-top: 10px;
    }
    .metric-card {
      background: var(--panel-highlight);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 9px 10px;
      min-width: 0;
    }
    .metric-label {
      color: var(--muted);
      font-size: 11px;
      margin-bottom: 4px;
    }
    .metric-value {
      font-size: 13px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .mini-stats {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-top: 10px;
    }
    .mini-stat {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 8px 10px;
      background: rgba(255,255,255,0.025);
      border: 1px solid var(--border);
      border-radius: 8px;
    }
    .mini-label {
      color: var(--muted);
      font-size: 12px;
    }
    .mini-value {
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      font-size: 12px;
    }
    .cost-breakdown {
      margin-top: 10px;
      color: var(--muted);
      font-size: 11px;
      line-height: 1.5;
    }
    .actions {
      display: grid;
      grid-template-columns: 1fr;
      gap: 2px;
      margin-top: 12px;
    }
    button {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 2px;
      border: 0;
      border-radius: 0;
      border-bottom: 1px solid var(--border);
      background: transparent;
      color: var(--text);
      text-align: left;
      cursor: pointer;
      font: inherit;
    }
    button:hover {
      color: #ffffff;
      background: rgba(255, 255, 255, 0.03);
    }
    .action-text {
      font-size: 13px;
      font-weight: 500;
    }
    .action-hint {
      color: var(--muted);
      font-size: 14px;
    }
    .danger {
      color: #ffd0cc;
    }
    .danger .action-hint {
      color: rgba(255, 208, 204, 0.7);
    }
  </style>
</head>
<body>
  <div class="shell">
    <div class="card">
      <div class="header">
        <div class="title">YSL Quota</div>
        <div class="badge">${hasInfo ? `yls ${viewModel.remainingText}` : '未配置'}</div>
      </div>

      <div class="section">
        <div class="row">
          <div class="label">套餐用量(已用)</div>
          <div class="value">${viewModel.packageUsageText}</div>
        </div>
        <div class="row">
          <div class="label">剩余额度</div>
          <div class="value">${viewModel.remainingText}</div>
        </div>
        <div class="row">
          <div class="label">用量进度</div>
          <div class="value progress-value">${viewModel.progressText}</div>
        </div>
        <div class="progress">
          <div class="progress-bar">
            <div class="progress-fill"></div>
          </div>
        </div>
        <div class="status">更新时间: ${viewModel.updatedText}</div>
        <div class="status">${statusText}</div>
      </div>

      <div class="section">
        <div class="metric-grid">
          ${summaryMarkup}
        </div>
        <div class="mini-stats">
          ${secondaryMarkup}
        </div>
        <div class="cost-breakdown">${viewModel.costBreakdownText}</div>
      </div>

      <div class="section actions">
        <button data-command="refresh"><span class="action-text">立即刷新</span><span class="action-hint">›</span></button>
        <button data-command="setApiKey"><span class="action-text">设置 API Key...</span><span class="action-hint">›</span></button>
        <button data-command="setInterval"><span class="action-text">设置轮询间隔...</span><span class="action-hint">›</span></button>
        <button class="danger" data-command="clearApiKey"><span class="action-text">清除 API Key</span><span class="action-hint">›</span></button>
      </div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    for (const button of document.querySelectorAll('button[data-command]')) {
      button.addEventListener('click', () => {
        vscode.postMessage({ command: button.dataset.command });
      });
    }
  </script>
</body>
</html>`;
  }

  function openPanel() {
    if (state.panel) {
      state.panel.reveal(vscode.ViewColumn.Active, true);
      updatePanel();
      return;
    }

    state.panel = vscode.window.createWebviewPanel(
      'codexQuotaMonitor.details',
      'YSL Quota',
      { viewColumn: vscode.ViewColumn.Active, preserveFocus: true },
      { enableScripts: true },
    );
    state.panel.onDidDispose(() => {
      state.panel = undefined;
    }, null, context.subscriptions);
    state.panel.webview.onDidReceiveMessage(async message => {
      if (message.command === 'refresh') {
        await refresh();
      } else if (message.command === 'setApiKey') {
        await setApiKey();
      } else if (message.command === 'setInterval') {
        await setRefreshInterval();
      } else if (message.command === 'clearApiKey') {
        await clearApiKey();
      }
      updatePanel();
    }, null, context.subscriptions);
    updatePanel();
  }

  function restartTimer() {
    if (state.refreshTimer) {
      clearInterval(state.refreshTimer);
    }

    state.refreshTimer = setInterval(() => {
      void refresh();
    }, getRefreshIntervalMs());
  }

  context.subscriptions.push(
    vscode.commands.registerCommand(REFRESH_COMMAND, refresh),
    vscode.commands.registerCommand(OPEN_PANEL_COMMAND, openPanel),
    vscode.commands.registerCommand(SET_KEY_COMMAND, setApiKey),
    vscode.commands.registerCommand(SET_INTERVAL_COMMAND, setRefreshInterval),
    vscode.commands.registerCommand(CLEAR_KEY_COMMAND, clearApiKey),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('codexQuotaMonitor')) {
        restartTimer();
        void refresh();
      }
    }),
  );

  setStatusBarIdle('Quota key?');
  restartTimer();
  void refresh();
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
