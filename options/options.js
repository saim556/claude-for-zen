/**
 * Claude for Zen - Options Page
 */

const apiKeyInput = document.getElementById("api-key");
const toggleKeyBtn = document.getElementById("toggle-key");
const modelSelect = document.getElementById("model");
const saveApiBtn = document.getElementById("save-api");
const apiStatus = document.getElementById("api-status");
const domainListEl = document.getElementById("domain-list");
const clearDomainsBtn = document.getElementById("clear-domains");

// Account sections
const accountPro = document.getElementById("account-pro");
const accountApikey = document.getElementById("account-apikey");
const accountNone = document.getElementById("account-none");
const proPlanLabel = document.getElementById("pro-plan-label");
const logoutProBtn = document.getElementById("logout-pro");
const loginFromSettings = document.getElementById("login-from-settings");

// Load saved settings
async function loadSettings() {
  const data = await browser.storage.local.get(["apiKey", "model", "allowedDomains", "authMode"]);

  if (data.apiKey) {
    apiKeyInput.value = data.apiKey;
  }
  if (data.model) {
    modelSelect.value = data.model;
  }
  renderDomainList(data.allowedDomains || {});

  // Show account state
  await refreshAccountState();
}

async function refreshAccountState() {
  const state = await browser.runtime.sendMessage({ type: "GET_STATE" });

  accountPro.classList.add("hidden");
  accountApikey.classList.add("hidden");
  accountNone.classList.add("hidden");

  if (state.authMode === "pro" && state.proLoggedIn) {
    accountPro.classList.remove("hidden");
    const plan = state.proPlanType || "Pro";
    const name = state.proDisplayName || "Claude";
    proPlanLabel.textContent = `${name} (${plan})`;
  } else if (state.authMode === "api_key" && state.hasApiKey) {
    accountApikey.classList.remove("hidden");
  } else {
    accountNone.classList.remove("hidden");
  }
}

// Toggle API key visibility
toggleKeyBtn.addEventListener("click", () => {
  apiKeyInput.type = apiKeyInput.type === "password" ? "text" : "password";
});

// Save API settings
saveApiBtn.addEventListener("click", async () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    showStatus("Please enter an API key.", "error");
    return;
  }

  await browser.runtime.sendMessage({
    type: "SET_API_KEY",
    apiKey: key,
    model: modelSelect.value
  });

  showStatus("Settings saved.", "success");
  await refreshAccountState();
});

// Pro logout
logoutProBtn.addEventListener("click", async () => {
  await browser.runtime.sendMessage({ type: "LOGOUT_PRO" });
  showStatus("Logged out.", "success");
  await refreshAccountState();
});

// Login from settings
loginFromSettings.addEventListener("click", async () => {
  loginFromSettings.disabled = true;
  loginFromSettings.textContent = "Opening claude.ai...";

  const result = await browser.runtime.sendMessage({ type: "LOGIN_PRO" });

  loginFromSettings.disabled = false;
  loginFromSettings.textContent = "Log in with Claude.ai";

  if (result.success) {
    showStatus("Logged in successfully!", "success");
    await refreshAccountState();
  } else {
    showStatus(result.error || "Login failed.", "error");
  }
});

// Domain list
function renderDomainList(domains) {
  const entries = Object.entries(domains).filter(([, v]) => v);

  if (entries.length === 0) {
    domainListEl.innerHTML = '<p class="empty-state">No domains allowed yet.</p>';
    return;
  }

  domainListEl.innerHTML = "";
  for (const [domain] of entries) {
    const item = document.createElement("div");
    item.className = "domain-item";

    const name = document.createElement("span");
    name.textContent = domain;

    const revokeBtn = document.createElement("button");
    revokeBtn.textContent = "Revoke";
    revokeBtn.addEventListener("click", async () => {
      await browser.runtime.sendMessage({
        type: "SET_DOMAIN_PERMISSION",
        domain,
        allowed: false
      });
      item.remove();
      if (domainListEl.children.length === 0) {
        domainListEl.innerHTML = '<p class="empty-state">No domains allowed yet.</p>';
      }
    });

    item.appendChild(name);
    item.appendChild(revokeBtn);
    domainListEl.appendChild(item);
  }
}

// Clear all domains
clearDomainsBtn.addEventListener("click", async () => {
  await browser.storage.local.set({ allowedDomains: {} });
  renderDomainList({});
  showStatus("All domain permissions revoked.", "success");
});

function showStatus(msg, type) {
  apiStatus.textContent = msg;
  apiStatus.className = `status ${type}`;
  apiStatus.classList.remove("hidden");
  setTimeout(() => apiStatus.classList.add("hidden"), 3000);
}

loadSettings();
