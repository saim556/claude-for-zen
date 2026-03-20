# Claude for Zen

A browser extension that brings Claude AI to your Zen Browser sidebar. Claude can navigate, click, and fill forms across your tabs.

Built as the Zen/Firefox equivalent of [Claude for Chrome](https://claude.com/claude-for-chrome).

## Features

- **Sidebar chat** — Talk to Claude without leaving the page
- **Page screenshots** — Capture the visible tab and send it as context
- **Page interaction** — Claude can click elements, fill forms, scroll, navigate, and run JavaScript
- **Per-domain permissions** — You approve each domain before Claude can interact with it
- **Dual auth** — Log in with your Claude.ai Pro/Max/Team/Enterprise account, or use an API key
- **Model switching** — Switch between Sonnet 4.5, Opus 4.6, and Haiku 4.5 on the fly
- **Safety blocklist** — Banking, crypto, and financial sites are always blocked

## Installation

### From source (recommended)

1. Clone this repo:
   ```
   git clone https://github.com/saim556/claude-for-zen.git
   ```

2. Open Zen Browser and navigate to:
   ```
   about:debugging#/runtime/this-firefox
   ```

3. Click **"Load Temporary Add-on..."**

4. Select the `manifest.json` file from the cloned folder

5. The Claude icon will appear in your sidebar — click it to open

> **Note:** Temporary add-ons are removed when the browser closes. For a permanent install, see [Permanent Installation](#permanent-installation) below.

### Permanent installation

To keep the extension across browser restarts:

1. Go to `about:config` in Zen Browser
2. Search for `xpinstall.signatures.required` and set it to `false`
3. Build the `.xpi` package:
   - **Windows:** Double-click `build.bat` in the project folder
   - **Linux/Mac:** `cd claude-for-zen && zip -r claude-for-zen.xpi manifest.json background.js content/ sidebar/ options/ icons/`
4. Go to `about:addons` → gear icon → **"Install Add-on From File..."**
5. Select the `claude-for-zen.xpi` file
6. The extension is now permanent and survives browser restarts

## Setup

When you first open the sidebar, you'll see two auth options:

### Option 1: Log in with Claude.ai (Pro/Max/Team/Enterprise)

1. Click **"Log in with Claude.ai"**
2. A new tab opens to `claude.ai/login`
3. Log in with your existing account
4. The extension detects your session automatically and brings you to the chat
5. No API key needed — uses your existing subscription

### Option 2: Use an API key

1. Click **"Use API Key"**
2. Enter your Anthropic API key (`sk-ant-...`)
3. Pick a model
4. Click **Connect**

You can get an API key from [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys).

## Usage

### Chat
Type a message in the input box and press Enter. Claude responds with context about your current tab.

### Screenshots
Click the camera icon to capture the current page. The screenshot attaches to your next message so Claude can see what you see.

### Page actions
When Claude suggests an action (clicking a button, filling a form, etc.), it appears as a clickable action block in the chat. Click it to execute.

Before Claude can interact with any domain, you'll see a permission banner at the top of the sidebar asking you to **Allow** or **Deny** access.

### Settings
Click the gear icon to open the settings page where you can:
- View/change your auth method
- Update your API key or model
- **Auto-allow all domains** — skip the permission prompt for every site
- **Auto-capture screenshots** — automatically screenshot the page with every message
- **Streaming animation** — toggle the Claude-style typing animation on/off
- Manage domain permissions
- Revoke all permissions at once

## Project structure

```
claude-for-zen/
  manifest.json            Firefox WebExtension manifest (v2)
  background.js            API communication, auth, tab tracking
  sidebar/
    sidebar.html           Chat panel UI
    sidebar.css            Dark theme styles
    sidebar.js             Chat logic, auth flows, actions
  content/
    content.js             DOM interaction on web pages
  options/
    options.html           Settings page
    options.css            Settings styles
    options.js             Settings logic
  icons/
    icon-16/32/48/96/128.png
```

## Safety

- Claude refuses to fill password fields
- Banking, crypto, and financial sites are always blocked (PayPal, Coinbase, Chase, etc.)
- Each domain requires explicit user approval before any interaction
- Elements are visually highlighted before Claude interacts with them

## Requirements

- Zen Browser (or any Firefox-based browser, version 115+)
- A Claude.ai account (Pro, Max, Team, or Enterprise) **or** an Anthropic API key

## License

MIT
