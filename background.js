// Runs once on install/update. Shows the number of blocked requests on the toolbar icon.
const api = typeof browser !== "undefined" ? browser : chrome;

api.runtime.onInstalled.addListener(async () => {
  try {
    await api.declarativeNetRequest.setExtensionActionOptions({
      displayActionCountAsBadgeText: true,
    });
  } catch (e) {
    console.warn("Badge counter not supported here:", e);
  }
  await rebuildAllowRules();
});

// Turn the saved allowlist into dynamic DNR rules.
// "allowAllRequests" on a site's main_frame lets everything on that page load.
async function rebuildAllowRules() {
  const { allowlist = [] } = await api.storage.local.get("allowlist");
  const existing = await api.declarativeNetRequest.getDynamicRules();
  await api.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map((r) => r.id),
    addRules: allowlist.map((host, i) => ({
      id: i + 1,
      priority: 100,
      action: { type: "allowAllRequests" },
      condition: { requestDomains: [host], resourceTypes: ["main_frame"] },
    })),
  });
}

// Popup tells us when the allowlist changed.
api.runtime.onMessage.addListener((msg) => {
  if (msg === "allowlist-changed") rebuildAllowRules();
});
