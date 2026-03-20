/**
 * Claude for Zen - Background Script
 * Handles Claude API communication (API key + claude.ai Pro session),
 * tab management, and message routing.
 */

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_WEB_BASE = "https://claude.ai";
const BLOCKED_DOMAINS = [
  "banking", "chase.com", "bankofamerica.com", "wellsfargo.com",
  "paypal.com", "venmo.com", "coinbase.com", "binance.com",
  "robinhood.com", "fidelity.com", "schwab.com", "etrade.com"
];

let conversationHistory = {};  // tabId -> messages[]
let webConversations = {};     // tabId -> { orgId, conversationId }
let allowedDomains = {};       // domain -> boolean
let authMode = null;           // "api_key" | "pro"
let apiKey = null;
let model = "claude-sonnet-4-5-20250929";
let proSession = null;         // { orgId, displayName, email }

// Load saved settings on startup
browser.storage.local.get(["apiKey", "model", "allowedDomains", "authMode"]).then((data) => {
  if (data.apiKey) apiKey = data.apiKey;
  if (data.model) model = data.model;
  if (data.allowedDomains) allowedDomains = data.allowedDomains;
  if (data.authMode) authMode = data.authMode;

  // If pro mode, check session on startup
  if (authMode === "pro") {
    checkProSession().catch(() => {});
  }
});

// Listen for messages from sidebar and content scripts
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case "SET_API_KEY":
      return handleSetApiKey(message);

    case "LOGIN_PRO":
      return handleLoginPro();

    case "CHECK_PRO_SESSION":
      return checkProSession();

    case "LOGOUT_PRO":
      return handleLogoutPro();

    case "GET_STATE":
      return handleGetState();

    case "SEND_MESSAGE":
      return handleSendMessage(message);

    case "CAPTURE_SCREENSHOT":
      return handleCaptureScreenshot();

    case "EXECUTE_ACTION":
      return handleExecuteAction(message);

    case "SET_DOMAIN_PERMISSION":
      return handleSetDomainPermission(message);

    case "NEW_CHAT":
      return handleNewChat(message);

    case "GET_TAB_INFO":
      return handleGetTabInfo();

    case "SET_MODEL":
      return handleSetModel(message);

    default:
      return Promise.resolve({ error: "Unknown message type" });
  }
});

// Track active tab changes to update sidebar context
browser.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await browser.tabs.get(activeInfo.tabId);
    browser.runtime.sendMessage({
      type: "TAB_CHANGED",
      tab: { id: tab.id, url: tab.url, title: tab.title }
    }).catch(() => {});
  } catch (e) {}
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") {
    browser.runtime.sendMessage({
      type: "TAB_CHANGED",
      tab: { id: tab.id, url: tab.url, title: tab.title }
    }).catch(() => {});
  }
});

// ==========================================
// AUTH HANDLERS
// ==========================================

async function handleSetApiKey(message) {
  apiKey = message.apiKey;
  authMode = "api_key";
  if (message.model) model = message.model;
  await browser.storage.local.set({ apiKey, model, authMode });
  return { success: true };
}

async function handleLoginPro() {
  // First check if user is already logged in (has valid cookies)
  const existing = await checkProSession();
  if (existing.loggedIn) {
    return { success: true, ...existing };
  }

  // Open claude.ai login page in a new tab
  const tab = await browser.tabs.create({ url: "https://claude.ai/login" });

  // Poll for successful login by watching for session cookies
  return new Promise((resolve) => {
    let attempts = 0;
    const maxAttempts = 120; // 2 minutes of polling

    const interval = setInterval(async () => {
      attempts++;

      if (attempts > maxAttempts) {
        clearInterval(interval);
        resolve({ error: "Login timed out. Please try again." });
        return;
      }

      const session = await checkProSession();
      if (session.loggedIn) {
        clearInterval(interval);
        // Close the login tab
        try { await browser.tabs.remove(tab.id); } catch (e) {}
        resolve({ success: true, ...session });
      }
    }, 1000);

    // Also stop polling if the user closes the login tab
    const onRemoved = (removedTabId) => {
      if (removedTabId === tab.id) {
        clearInterval(interval);
        browser.tabs.onRemoved.removeListener(onRemoved);
        // Check one final time
        checkProSession().then((session) => {
          resolve(session.loggedIn ? { success: true, ...session } : { error: "Login tab closed." });
        });
      }
    };
    browser.tabs.onRemoved.addListener(onRemoved);
  });
}

async function checkProSession() {
  try {
    // Check if any claude.ai cookies exist first
    const cookies = await browser.cookies.getAll({ domain: ".claude.ai" });
    if (!cookies || cookies.length === 0) {
      proSession = null;
      return { loggedIn: false };
    }

    // Use credentials: "include" so Firefox sends cookies automatically
    // (manually setting Cookie header is forbidden in fetch)
    const response = await fetch(`${CLAUDE_WEB_BASE}/api/organizations`, {
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      proSession = null;
      return { loggedIn: false };
    }

    const orgs = await response.json();
    if (!orgs || orgs.length === 0) {
      proSession = null;
      return { loggedIn: false };
    }

    // Use the first org (personal)
    const org = orgs[0];
    proSession = {
      orgId: org.uuid,
      displayName: org.name || "Claude Pro",
      planType: org.billing?.plan_type || "pro"
    };
    authMode = "pro";
    await browser.storage.local.set({ authMode });

    return {
      loggedIn: true,
      displayName: proSession.displayName,
      planType: proSession.planType
    };
  } catch (e) {
    proSession = null;
    return { loggedIn: false, error: e.message };
  }
}

async function handleLogoutPro() {
  proSession = null;
  authMode = null;
  webConversations = {};
  await browser.storage.local.set({ authMode: null });
  // Clear claude.ai cookies
  const cookies = await browser.cookies.getAll({ domain: ".claude.ai" });
  for (const cookie of cookies) {
    await browser.cookies.remove({
      url: `https://claude.ai${cookie.path}`,
      name: cookie.name
    });
  }
  return { success: true };
}

async function handleSetModel(message) {
  model = message.model;
  await browser.storage.local.set({ model });
  return { success: true };
}

// ==========================================
// STATE
// ==========================================

async function handleGetState() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0] || null;

  let loggedIn = false;
  if (authMode === "pro" && proSession) {
    loggedIn = true;
  }

  return {
    authMode,
    hasApiKey: !!apiKey,
    proLoggedIn: loggedIn,
    proDisplayName: proSession?.displayName || null,
    proPlanType: proSession?.planType || null,
    model,
    allowedDomains,
    activeTab: tab ? { id: tab.id, url: tab.url, title: tab.title } : null
  };
}

// ==========================================
// MESSAGING
// ==========================================

async function handleSendMessage(message) {
  if (authMode === "api_key") {
    return sendViaApi(message);
  } else if (authMode === "pro") {
    return sendViaClaudeWeb(message);
  }
  return { error: "Not authenticated. Please set up API key or log in with Claude Pro." };
}

// --- API Key Mode ---
async function sendViaApi(message) {
  if (!apiKey) return { error: "API key not set" };

  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab) return { error: "No active tab" };

  const tabId = tab.id;
  if (!conversationHistory[tabId]) {
    conversationHistory[tabId] = [];
  }

  const userContent = [];
  if (message.screenshot) {
    userContent.push({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/png",
        data: message.screenshot.replace(/^data:image\/png;base64,/, "")
      }
    });
  }
  userContent.push({ type: "text", text: message.text });

  conversationHistory[tabId].push({ role: "user", content: userContent });

  const domain = getDomain(tab.url);
  const systemPrompt = buildSystemPrompt(tab, domain);

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: conversationHistory[tabId]
      })
    });

    if (!response.ok) {
      const errBody = await response.text();
      return { error: `API error (${response.status}): ${errBody}` };
    }

    const data = await response.json();
    const assistantMessage = data.content[0].text;

    conversationHistory[tabId].push({
      role: "assistant",
      content: assistantMessage
    });

    const actions = parseActions(assistantMessage);
    return { text: assistantMessage, actions, usage: data.usage };
  } catch (e) {
    return { error: `Request failed: ${e.message}` };
  }
}

// --- Claude.ai Pro Mode ---
async function sendViaClaudeWeb(message) {
  if (!proSession) {
    const check = await checkProSession();
    if (!check.loggedIn) {
      return { error: "Pro session expired. Please log in again." };
    }
  }

  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab) return { error: "No active tab" };

  const tabId = tab.id;

  const domain = getDomain(tab.url);
  const orgId = proSession.orgId;

  try {
    // Create a new conversation if we don't have one for this tab
    if (!webConversations[tabId]) {
      const convResp = await fetch(`${CLAUDE_WEB_BASE}/api/organizations/${orgId}/chat_conversations`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: "",
          model: mapModelToWebModel(model),
          project_uuid: null
        })
      });

      if (!convResp.ok) {
        const errText = await convResp.text();
        return { error: `Failed to create conversation (${convResp.status}): ${errText}` };
      }

      const convData = await convResp.json();
      webConversations[tabId] = {
        conversationId: convData.uuid
      };
    }

    const conversationId = webConversations[tabId].conversationId;

    // Build the message content
    let promptText = message.text;

    // Add page context as system-level info in the prompt
    const contextPrefix = `[Browser context: Currently on "${tab.title}" at ${tab.url} | Domain: ${domain} | Domain access: ${allowedDomains[domain] ? "ALLOWED" : "NOT ALLOWED"}]\n\n`;
    promptText = contextPrefix + promptText;

    // Build attachments array for screenshots
    const attachments = [];
    if (message.screenshot) {
      // Convert base64 screenshot to a file upload
      const screenshotData = message.screenshot.replace(/^data:image\/png;base64,/, "");
      attachments.push({
        file_name: "screenshot.png",
        file_type: "image/png",
        file_size: Math.round(screenshotData.length * 0.75),
        extracted_content: `[Screenshot of ${tab.title}]`
      });
    }

    // Send the completion request
    const completionResp = await fetch(
      `${CLAUDE_WEB_BASE}/api/organizations/${orgId}/chat_conversations/${conversationId}/completion`,
      {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Accept": "text/event-stream"
        },
        body: JSON.stringify({
          prompt: promptText,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          attachments,
          files: [],
          model: mapModelToWebModel(model),
          rendering_mode: "messages"
        })
      }
    );

    if (!completionResp.ok) {
      const errText = await completionResp.text();
      if (completionResp.status === 401 || completionResp.status === 403) {
        proSession = null;
        return { error: "Session expired. Please log in again." };
      }
      return { error: `Completion failed (${completionResp.status}): ${errText}` };
    }

    // Parse SSE response
    const fullText = await parseSSEResponse(completionResp);

    const actions = parseActions(fullText);
    return { text: fullText, actions };
  } catch (e) {
    return { error: `Request failed: ${e.message}` };
  }
}

// ==========================================
// SSE PARSING
// ==========================================

async function parseSSEResponse(response) {
  const text = await response.text();
  let fullMessage = "";

  const lines = text.split("\n");
  for (const line of lines) {
    if (line.startsWith("data: ")) {
      try {
        const data = JSON.parse(line.slice(6));
        if (data.type === "completion" && data.completion) {
          fullMessage = data.completion;
        } else if (data.type === "content_block_delta" && data.delta?.text) {
          fullMessage += data.delta.text;
        } else if (data.type === "message_start" && data.message?.content) {
          // Handle full message format
          for (const block of data.message.content) {
            if (block.type === "text") fullMessage += block.text;
          }
        }
      } catch (e) {
        // Not all data lines are JSON, skip
      }
    }
  }

  return fullMessage;
}

// ==========================================
// SCREENSHOT, ACTIONS, TABS
// ==========================================

async function handleCaptureScreenshot() {
  try {
    const dataUrl = await browser.tabs.captureVisibleTab(null, {
      format: "png",
      quality: 80
    });
    return { screenshot: dataUrl };
  } catch (e) {
    return { error: `Screenshot failed: ${e.message}` };
  }
}

async function handleExecuteAction(message) {
  const { action } = message;
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab) return { error: "No active tab" };

  const domain = getDomain(tab.url);

  if (!allowedDomains[domain]) {
    return { error: `Permission not granted for ${domain}. Please allow access first.` };
  }

  if (isBlockedDomain(domain)) {
    return { error: `Actions are blocked on ${domain} for safety.` };
  }

  try {
    const result = await browser.tabs.sendMessage(tab.id, {
      type: "EXECUTE_ACTION",
      action
    });
    return result;
  } catch (e) {
    return { error: `Action failed: ${e.message}` };
  }
}

async function handleSetDomainPermission(message) {
  const { domain, allowed } = message;
  if (isBlockedDomain(domain)) {
    return { error: `${domain} is blocked for safety reasons.` };
  }
  allowedDomains[domain] = allowed;
  await browser.storage.local.set({ allowedDomains });
  return { success: true };
}

async function handleNewChat(message) {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (tab) {
    conversationHistory[tab.id] = [];
    delete webConversations[tab.id];
  }
  return { success: true };
}

async function handleGetTabInfo() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab) return { error: "No active tab" };
  return { id: tab.id, url: tab.url, title: tab.title };
}

// ==========================================
// UTILITIES
// ==========================================

function mapModelToWebModel(modelId) {
  // Map API model IDs to claude.ai web model slugs
  const map = {
    "claude-opus-4-6": "claude-opus-4-6",
    "claude-sonnet-4-5-20250929": "claude-sonnet-4-5-20250929",
    "claude-haiku-4-5-20251001": "claude-haiku-4-5-20251001"
  };
  return map[modelId] || modelId;
}

function buildSystemPrompt(tab, domain) {
  return `You are Claude, an AI assistant embedded in a Zen browser extension. You help users interact with web pages.

Current page: ${tab.title}
URL: ${tab.url}
Domain: ${domain}
Domain access: ${allowedDomains[domain] ? "ALLOWED - you may execute JavaScript on this domain" : "NOT ALLOWED - ask the user to grant permission first"}

You can help by:
- Reading and summarizing page content (from screenshots)
- Suggesting actions to take on the page
- Filling forms, clicking buttons, navigating (when domain access is allowed)

When you need to perform an action on the page, respond with a JSON action block:
\`\`\`action
{
  "type": "click" | "fill" | "navigate" | "scroll" | "execute_js",
  "selector": "CSS selector for the target element",
  "value": "value for fill actions or JS code for execute_js",
  "description": "human-readable description of what this does"
}
\`\`\`

Safety rules:
- Never input passwords, credit card numbers, or sensitive credentials
- Never execute actions on financial/banking sites
- Always explain what you're about to do before doing it
- If the domain is not allowed, ask the user to grant permission via the banner`;
}

function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function isBlockedDomain(domain) {
  return BLOCKED_DOMAINS.some((blocked) =>
    domain === blocked || domain.endsWith("." + blocked)
  );
}

function parseActions(text) {
  const actions = [];
  const regex = /```action\s*\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    try {
      actions.push(JSON.parse(match[1]));
    } catch (e) {}
  }
  return actions;
}

// Cleanup when tabs close
browser.tabs.onRemoved.addListener((tabId) => {
  delete conversationHistory[tabId];
  delete webConversations[tabId];
});
