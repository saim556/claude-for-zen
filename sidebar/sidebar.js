/**
 * Claude for Zen - Sidebar Panel
 * Chat UI with dual auth: Claude.ai Pro login or API key.
 */

// --- State ---
let currentTab = null;
let pendingScreenshot = null;
let isStreaming = false;
let loginAbortController = null;

// --- DOM refs ---
const setupScreen = document.getElementById("setup-screen");
const chatScreen = document.getElementById("chat-screen");
const authPicker = document.getElementById("auth-picker");
const loginProBtn = document.getElementById("login-pro-btn");
const showApikeyBtn = document.getElementById("show-apikey-btn");
const proLoginState = document.getElementById("pro-login-state");
const cancelLoginBtn = document.getElementById("cancel-login-btn");
const loginStatus = proLoginState.querySelector(".login-status");
const apikeyForm = document.getElementById("apikey-form");
const backToPickerBtn = document.getElementById("back-to-picker");
const apiKeyInput = document.getElementById("api-key-input");
const modelSelect = document.getElementById("model-select");
const saveKeyBtn = document.getElementById("save-key-btn");
const messagesEl = document.getElementById("messages");
const messageInput = document.getElementById("message-input");
const sendBtn = document.getElementById("send-btn");
const screenshotBtn = document.getElementById("screenshot-btn");
const newChatBtn = document.getElementById("new-chat-btn");
const settingsBtn = document.getElementById("settings-btn");
const permissionBanner = document.getElementById("permission-banner");
const permissionDomain = document.getElementById("permission-domain");
const allowDomainBtn = document.getElementById("allow-domain-btn");
const denyDomainBtn = document.getElementById("deny-domain-btn");
const pageContext = document.getElementById("page-context");
const authBar = document.getElementById("auth-bar");
const authBarIcon = document.getElementById("auth-bar-icon");
const authBarLabel = document.getElementById("auth-bar-label");
const modelSwitcher = document.getElementById("model-switcher");

// ===========================================
// INIT
// ===========================================

async function init() {
  const state = await browser.runtime.sendMessage({ type: "GET_STATE" });

  if (state.authMode === "pro" && state.proLoggedIn) {
    showChatScreen(state);
  } else if (state.authMode === "api_key" && state.hasApiKey) {
    showChatScreen(state);
  } else {
    // Check if user might already be logged into claude.ai
    const sessionCheck = await browser.runtime.sendMessage({ type: "CHECK_PRO_SESSION" });
    if (sessionCheck.loggedIn) {
      const freshState = await browser.runtime.sendMessage({ type: "GET_STATE" });
      showChatScreen(freshState);
    } else {
      showSetupScreen();
    }
  }
}

function showSetupScreen() {
  setupScreen.classList.remove("hidden");
  chatScreen.classList.add("hidden");
  // Reset to picker view
  authPicker.classList.remove("hidden");
  proLoginState.classList.add("hidden");
  apikeyForm.classList.add("hidden");
}

function showChatScreen(state) {
  setupScreen.classList.add("hidden");
  chatScreen.classList.remove("hidden");
  updateAuthBar(state);
  if (state.model) {
    modelSwitcher.value = state.model;
  }
  if (state.activeTab) {
    updateTabContext(state.activeTab);
  }
  messageInput.focus();
}

function updateAuthBar(state) {
  authBar.classList.remove("hidden");
  if (state.authMode === "pro") {
    const plan = state.proPlanType || "pro";
    authBarLabel.textContent = `${state.proDisplayName || "Claude"} (${plan})`;
    authBarIcon.style.background = "var(--success)";
  } else {
    authBarLabel.textContent = "API Key";
    authBarIcon.style.background = "var(--accent)";
  }
}

// ===========================================
// AUTH: PRO LOGIN
// ===========================================

loginProBtn.addEventListener("click", async () => {
  // Switch to loading state
  authPicker.classList.add("hidden");
  proLoginState.classList.remove("hidden");
  loginStatus.textContent = "Opening claude.ai for login...";

  const result = await browser.runtime.sendMessage({ type: "LOGIN_PRO" });

  if (result.success) {
    loginStatus.textContent = "Logged in! Loading...";
    const state = await browser.runtime.sendMessage({ type: "GET_STATE" });
    showChatScreen(state);
  } else {
    loginStatus.textContent = result.error || "Login failed. Try again.";
    setTimeout(() => {
      showSetupScreen();
    }, 2000);
  }
});

cancelLoginBtn.addEventListener("click", () => {
  showSetupScreen();
});

// ===========================================
// AUTH: API KEY
// ===========================================

showApikeyBtn.addEventListener("click", () => {
  authPicker.classList.add("hidden");
  apikeyForm.classList.remove("hidden");
  apiKeyInput.focus();
});

backToPickerBtn.addEventListener("click", () => {
  apikeyForm.classList.add("hidden");
  authPicker.classList.remove("hidden");
});

saveKeyBtn.addEventListener("click", async () => {
  const key = apiKeyInput.value.trim();
  if (!key) return;

  saveKeyBtn.disabled = true;
  saveKeyBtn.textContent = "Connecting...";

  const result = await browser.runtime.sendMessage({
    type: "SET_API_KEY",
    apiKey: key,
    model: modelSelect.value
  });

  if (result.success) {
    const state = await browser.runtime.sendMessage({ type: "GET_STATE" });
    showChatScreen(state);
  } else {
    saveKeyBtn.disabled = false;
    saveKeyBtn.textContent = "Connect";
  }
});

apiKeyInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") saveKeyBtn.click();
});

// ===========================================
// MODEL SWITCHER
// ===========================================

modelSwitcher.addEventListener("change", async () => {
  await browser.runtime.sendMessage({
    type: "SET_MODEL",
    model: modelSwitcher.value
  });
});

// ===========================================
// SETTINGS
// ===========================================

settingsBtn.addEventListener("click", () => {
  browser.runtime.openOptionsPage();
});

// ===========================================
// TAB CONTEXT & DOMAIN PERMISSIONS
// ===========================================

function updateTabContext(tab) {
  currentTab = tab;
  if (tab && tab.url) {
    const domain = getDomain(tab.url);
    pageContext.textContent = truncate(tab.title || tab.url, 50);
    checkDomainPermission(domain);
  } else {
    pageContext.textContent = "";
    permissionBanner.classList.add("hidden");
  }
}

async function checkDomainPermission(domain) {
  const state = await browser.runtime.sendMessage({ type: "GET_STATE" });
  if (state.allowedDomains && state.allowedDomains[domain]) {
    permissionBanner.classList.add("hidden");
  } else if (domain && !domain.startsWith("about:") && !domain.startsWith("moz-extension:")) {
    permissionDomain.textContent = `Allow Claude to interact with ${domain}?`;
    permissionBanner.classList.remove("hidden");
  } else {
    permissionBanner.classList.add("hidden");
  }
}

allowDomainBtn.addEventListener("click", async () => {
  const domain = getDomain(currentTab?.url);
  if (!domain) return;
  await browser.runtime.sendMessage({
    type: "SET_DOMAIN_PERMISSION",
    domain,
    allowed: true
  });
  permissionBanner.classList.add("hidden");
  appendSystemMessage(`Access granted for ${domain}`);
});

denyDomainBtn.addEventListener("click", () => {
  permissionBanner.classList.add("hidden");
});

// ===========================================
// MESSAGES
// ===========================================

function appendMessage(role, content, extras = {}) {
  const welcome = messagesEl.querySelector(".welcome-message");
  if (welcome) welcome.remove();

  const msgEl = document.createElement("div");
  msgEl.className = `message ${role}`;

  const roleLabel = document.createElement("div");
  roleLabel.className = `message-role ${role}`;
  roleLabel.textContent = role === "user" ? "You" : "Claude";

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";

  if (extras.screenshot) {
    const img = document.createElement("img");
    img.src = extras.screenshot;
    img.className = "screenshot-thumb";
    img.alt = "Page screenshot";
    bubble.appendChild(img);
  }

  if (role === "assistant") {
    bubble.innerHTML = renderMarkdown(content);
  } else {
    bubble.textContent = content;
  }

  msgEl.appendChild(roleLabel);
  msgEl.appendChild(bubble);

  if (extras.actions && extras.actions.length > 0) {
    for (const action of extras.actions) {
      const actionEl = createActionButton(action);
      msgEl.appendChild(actionEl);
    }
  }

  messagesEl.appendChild(msgEl);
  scrollToBottom();
}

function appendSystemMessage(text) {
  const el = document.createElement("div");
  el.className = "action-indicator";
  el.textContent = text;
  messagesEl.appendChild(el);
  scrollToBottom();
}

function showTypingIndicator() {
  const el = document.createElement("div");
  el.className = "typing-indicator";
  el.id = "typing";
  el.innerHTML = "<span></span><span></span><span></span>";
  messagesEl.appendChild(el);
  scrollToBottom();
}

function hideTypingIndicator() {
  const el = document.getElementById("typing");
  if (el) el.remove();
}

function createActionButton(action) {
  const el = document.createElement("div");
  el.className = "action-indicator";
  el.style.cursor = "pointer";
  el.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polygon points="5 3 19 12 5 21 5 3"/>
    </svg>
    <span>${escapeHtml(action.description || action.type)}</span>
  `;
  el.addEventListener("click", () => executeAction(action));
  return el;
}

async function executeAction(action) {
  const indicator = document.createElement("div");
  indicator.className = "action-indicator";
  indicator.innerHTML = `<div class="spinner"></div><span>Executing: ${escapeHtml(action.description || action.type)}...</span>`;
  messagesEl.appendChild(indicator);
  scrollToBottom();

  const result = await browser.runtime.sendMessage({
    type: "EXECUTE_ACTION",
    action
  });

  indicator.remove();

  if (result.error) {
    appendSystemMessage(`Action failed: ${result.error}`);
  } else {
    appendSystemMessage(`Done: ${action.description || action.type}`);
  }
}

// ===========================================
// SEND MESSAGE
// ===========================================

async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || isStreaming) return;

  isStreaming = true;
  sendBtn.disabled = true;

  const extras = {};
  if (pendingScreenshot) {
    extras.screenshot = pendingScreenshot;
  }

  appendMessage("user", text, extras);
  messageInput.value = "";
  autoResize();

  showTypingIndicator();

  const result = await browser.runtime.sendMessage({
    type: "SEND_MESSAGE",
    text,
    screenshot: pendingScreenshot
  });

  hideTypingIndicator();
  pendingScreenshot = null;

  if (result.error) {
    // If session expired, prompt re-login
    if (result.error.includes("expired") || result.error.includes("log in")) {
      appendSystemMessage(`Session expired. Please log in again.`);
      setTimeout(() => showSetupScreen(), 1500);
    } else {
      appendSystemMessage(`Error: ${result.error}`);
    }
  } else {
    appendMessage("assistant", result.text, { actions: result.actions });
  }

  isStreaming = false;
  sendBtn.disabled = false;
  messageInput.focus();
}

sendBtn.addEventListener("click", sendMessage);

messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

messageInput.addEventListener("input", () => {
  sendBtn.disabled = !messageInput.value.trim();
  autoResize();
});

function autoResize() {
  messageInput.style.height = "auto";
  messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + "px";
}

// ===========================================
// SCREENSHOT
// ===========================================

screenshotBtn.addEventListener("click", async () => {
  screenshotBtn.disabled = true;
  const result = await browser.runtime.sendMessage({ type: "CAPTURE_SCREENSHOT" });
  screenshotBtn.disabled = false;

  if (result.error) {
    appendSystemMessage(`Screenshot failed: ${result.error}`);
    return;
  }

  pendingScreenshot = result.screenshot;
  appendSystemMessage("Screenshot captured - it will be sent with your next message.");
});

// ===========================================
// NEW CHAT
// ===========================================

newChatBtn.addEventListener("click", async () => {
  await browser.runtime.sendMessage({ type: "NEW_CHAT" });
  messagesEl.innerHTML = "";
  const welcome = document.createElement("div");
  welcome.className = "welcome-message";
  welcome.innerHTML = `
    <p>I can help you interact with web pages. I can:</p>
    <ul>
      <li>Navigate and click elements</li>
      <li>Fill out forms</li>
      <li>Read and summarize page content</li>
      <li>Execute actions across tabs</li>
    </ul>
    <p class="safety-note">I'll ask permission before interacting with each new domain.</p>
  `;
  messagesEl.appendChild(welcome);
  pendingScreenshot = null;
});

// ===========================================
// TAB CHANGE LISTENER
// ===========================================

browser.runtime.onMessage.addListener((message) => {
  if (message.type === "TAB_CHANGED") {
    updateTabContext(message.tab);
  }
});

// ===========================================
// UTILITIES
// ===========================================

function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function truncate(str, len) {
  return str.length > len ? str.substring(0, len) + "..." : str;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderMarkdown(text) {
  let html = escapeHtml(text);

  // Remove action blocks (rendered as buttons)
  html = html.replace(/```action\s*\n[\s\S]*?```/g, "");

  // Code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Line breaks
  html = html.replace(/\n/g, '<br>');

  return html;
}

// ===========================================
// START
// ===========================================
init();
