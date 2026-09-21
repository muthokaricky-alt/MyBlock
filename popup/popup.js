const api = typeof browser !== "undefined" ? browser : chrome;
const $ = (id) => document.getElementById(id);

let tab = null;
let host = null;
let allowlist = [];
let enabled = true;

const rebuild = () => api.runtime.sendMessage({ type: "rebuild" }); // resolves once rules are updated

function render() {
  const paused = !!host && allowlist.includes(host);
  $("power").checked = enabled;
  $("pause").textContent = paused ? "Resume blocking" : "Pause on this site";
  $("pause").classList.toggle("paused", paused);
  $("pause").disabled = !host || !enabled;
  $("pick").disabled = !host || !enabled || paused;
  $("status").textContent = !enabled ? "MyBlock is OFF everywhere."
    : paused ? "Paused on this site."
    : "Blocking is ON here.";
}

async function showStats() {
  try {
    // Needs activeTab, which the browser grants when the popup is opened. Counts rule matches on this tab.
    const res = await api.declarativeNetRequest.getMatchedRules({ tabId: tab.id });
    const n = res.rulesMatchedInfo.filter((m) => !(m.rule.rulesetId === "_dynamic" && m.rule.ruleId <= allowlist.length)).length;
    $("stats").textContent = "Blocked on this page: " + n;
  } catch {
    $("stats").textContent = ""; // not supported in this browser
  }
}

async function init() {
  [tab] = await api.tabs.query({ active: true, currentWindow: true });
  try { host = new URL(tab.url).hostname; } catch { host = null; }
  ({ allowlist = [], enabled = true } = await api.storage.local.get(["allowlist", "enabled"]));
  $("host").textContent = host || "Not available on this page";
  render();
  if (host) showStats();
}

$("power").addEventListener("change", async (e) => {
  enabled = e.target.checked;
  await api.storage.local.set({ enabled });
  await rebuild();
  render();
  if (tab) api.tabs.reload(tab.id);
});

$("pause").addEventListener("click", async () => {
  allowlist = allowlist.includes(host) ? allowlist.filter((h) => h !== host) : [...allowlist, host];
  await api.storage.local.set({ allowlist });
  await rebuild();
  render();
  api.tabs.reload(tab.id);
});

$("pick").addEventListener("click", async () => {
  try {
    await api.tabs.sendMessage(tab.id, { type: "start-picker" });
    window.close();
  } catch {
    $("status").textContent = "Reload the page first, then try again.";
  }
});

$("settings").addEventListener("click", () => { api.runtime.openOptionsPage(); window.close(); });

init();
