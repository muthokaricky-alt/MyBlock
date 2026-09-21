// Service worker. Keeps the browser's rules in sync with your settings.
//   static rules   rules/rules.json          (compiled by tools/convert.js)
//   dynamic rules  allowlist + custom filters (built here from storage)
const api = typeof browser !== "undefined" ? browser : chrome;
const CUSTOM_ID_BASE = 10000; // dynamic ids: 1..N allowlist, 10001.. custom filters

// Show the blocked-request count on the toolbar icon (persists once set).
try {
  api.declarativeNetRequest.setExtensionActionOptions({ displayActionCountAsBadgeText: true });
} catch (e) {
  console.warn("Badge counter not supported in this browser:", e);
}

async function rebuild() {
  const { enabled = true, allowlist = [], customRules = [] } = await api.storage.local.get([
    "enabled", "allowlist", "customRules",
  ]);
  const dnr = api.declarativeNetRequest;

  // Global switch: turn the whole static ruleset on or off.
  try {
    await dnr.updateEnabledRulesets(enabled ? { enableRulesetIds: ["main"] } : { disableRulesetIds: ["main"] });
  } catch (e) {
    console.warn("updateEnabledRulesets failed:", e);
  }

  const allow = allowlist.map((host, i) => ({
    id: i + 1,
    priority: 100,
    action: { type: "allowAllRequests" },
    condition: { requestDomains: [host], resourceTypes: ["main_frame"] },
  }));
  const custom = enabled
    ? customRules.map((r, i) => ({ ...r, id: CUSTOM_ID_BASE + i + 1 }))
    : [];

  const existing = await dnr.getDynamicRules();
  const removeRuleIds = existing.map((r) => r.id);
  try {
    await dnr.updateDynamicRules({ removeRuleIds, addRules: [...allow, ...custom] });
    await api.storage.local.set({ lastRuleError: "" });
  } catch (e) {
    // One bad custom rule rejects the whole batch. Fall back to the allowlist alone and report it.
    console.error("Custom rules rejected:", e);
    await dnr.updateDynamicRules({ removeRuleIds, addRules: allow });
    await api.storage.local.set({ lastRuleError: String((e && e.message) || e) });
  }
}

api.runtime.onInstalled.addListener(rebuild);
api.runtime.onStartup.addListener(rebuild);

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "rebuild") {
    rebuild().then(() => sendResponse({ ok: true }), (e) => sendResponse({ ok: false, error: String(e) }));
    return true; // keep the channel open for the async response
  }
});
