# Codex Quota Monitor

A lightweight VS Code extension for monitoring Codex quota usage from the status bar.

## Features

- Shows remaining quota in the status bar as `yls <remaining_quota>`
- Opens a compact quota card when clicked
- Displays:
  - used percentage
  - remaining quota
  - progress bar
  - total quota
  - total cost
  - total tokens
  - cached input tokens
  - reasoning output tokens
- Uses three visual pressure levels for usage progress:
  - below 60%: blue
  - 60% to 79.99%: yellow
  - 80% and above: red
- Stores the API key in VS Code SecretStorage

## Installation

### From GitHub Release

1. Download the latest `.vsix` from the GitHub Releases page.
2. In VS Code, open the Extensions view.
3. Open the top-right menu.
4. Choose `Install from VSIX...`
5. Select the downloaded package.

### From Command Line

```bash
code --install-extension ylsagi.codex-quota-monitor-0.0.5.vsix --force
```

## Usage

After installation:

1. Run `Codex Quota Monitor: Set API Key`
2. Enter your API key
3. Wait for the first refresh, or run `Codex Quota Monitor: Refresh`
4. Click the status bar item to open the detailed quota card

## Configuration

The extension contributes these settings:

- `codexQuotaMonitor.apiEndpoint`
- `codexQuotaMonitor.refreshIntervalMinutes`
- `codexQuotaMonitor.warningThreshold`

## Commands

- `Codex Quota Monitor: Refresh`
- `Codex Quota Monitor: Open Details`
- `Codex Quota Monitor: Set API Key`
- `Codex Quota Monitor: Set Refresh Interval`
- `Codex Quota Monitor: Clear API Key`

## Notes

- Do not commit or share your API key.
- The repository contains source code only. The `.vsix` package is published through GitHub Releases.

## License

MIT
