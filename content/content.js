/**
 * Claude for Zen - Content Script
 * Runs on every page. Handles DOM actions requested by Claude via the background script.
 */

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "EXECUTE_ACTION") {
    return handleAction(message.action);
  }
});

async function handleAction(action) {
  switch (action.type) {
    case "click":
      return handleClick(action);
    case "fill":
      return handleFill(action);
    case "navigate":
      return handleNavigate(action);
    case "scroll":
      return handleScroll(action);
    case "execute_js":
      return handleExecuteJs(action);
    default:
      return { error: `Unknown action type: ${action.type}` };
  }
}

function handleClick(action) {
  const el = document.querySelector(action.selector);
  if (!el) {
    return { error: `Element not found: ${action.selector}` };
  }

  // Highlight briefly before clicking
  highlightElement(el);

  setTimeout(() => {
    el.click();
  }, 300);

  return { success: true, description: `Clicked: ${action.selector}` };
}

function handleFill(action) {
  const el = document.querySelector(action.selector);
  if (!el) {
    return { error: `Element not found: ${action.selector}` };
  }

  // Safety: refuse to fill password or sensitive fields
  const inputType = (el.type || "").toLowerCase();
  if (inputType === "password") {
    return { error: "Refused to fill password field for safety." };
  }

  highlightElement(el);

  // Focus and set value with proper event dispatching
  el.focus();
  el.value = action.value || "";

  // Dispatch events so frameworks detect the change
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));

  return { success: true, description: `Filled ${action.selector} with value` };
}

function handleNavigate(action) {
  const url = action.value;
  if (!url) {
    return { error: "No URL provided for navigation" };
  }

  // Basic URL validation
  try {
    new URL(url, window.location.origin);
  } catch {
    return { error: `Invalid URL: ${url}` };
  }

  window.location.href = url;
  return { success: true, description: `Navigating to ${url}` };
}

function handleScroll(action) {
  if (action.selector) {
    const el = document.querySelector(action.selector);
    if (!el) {
      return { error: `Element not found: ${action.selector}` };
    }
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    highlightElement(el);
    return { success: true, description: `Scrolled to ${action.selector}` };
  }

  // Scroll by amount
  const amount = parseInt(action.value) || 500;
  window.scrollBy({ top: amount, behavior: "smooth" });
  return { success: true, description: `Scrolled by ${amount}px` };
}

function handleExecuteJs(action) {
  // Execute arbitrary JS - the permission check is done in the background script
  try {
    const result = new Function(action.value)();
    return {
      success: true,
      description: `Executed JS`,
      result: String(result ?? "undefined")
    };
  } catch (e) {
    return { error: `JS execution error: ${e.message}` };
  }
}

// Visual feedback: briefly highlight the target element
function highlightElement(el) {
  const originalOutline = el.style.outline;
  const originalTransition = el.style.transition;

  el.style.transition = "outline 0.15s ease";
  el.style.outline = "2px solid #D97757";

  setTimeout(() => {
    el.style.outline = originalOutline;
    el.style.transition = originalTransition;
  }, 1500);
}
