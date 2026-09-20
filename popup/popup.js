const api = typeof browser !== "undefined" ? browser : chrome;
const hostEl = document.getElementById("host");
const btn = document.getElementById("toggle");
const statusEl = document.getElementById("status");

let host = null;
let allowlist = [];

function render() {
  const paused = allowlist.includes(host);
  btn.textContent = paused ? "Resume blocking" : "Pause on this site";
  btn.classList.toggle("paused", paused);
  statusEl.textContent = paused ? "Blocking is OFF here." : "Blocking is ON here.";
}

async function init() {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  try {
    host = new URL(tab.url).hostname;
  } catch {
    host = null;
  }
  if (!host) {
    hostEl.textContent = "Not available on this page";
    btn.disabled = true;
    return;
  }
  hostEl.textContent = host;
  ({ allowlist = [] } = await api.storage.local.get("allowlist"));
  render();
}

btn.addEventListener("click", async () => {
  allowlist = allowlist.includes(host)
    ? allowlist.filter((h) => h !== host)
    : [...allowlist, host];
  await api.storage.local.set({ allowlist });
  await api.runtime.sendMessage("allowlist-changed");
  render();
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  api.tabs.reload(tab.id); // reload so the change takes effect
});

init();
