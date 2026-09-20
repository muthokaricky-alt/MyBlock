// Cosmetic filtering: hide ad boxes that are left behind after network blocking.
// Edit these lists as you find ads. Use DevTools > right-click an ad > Inspect to get selectors.

const GENERIC = [
  "ins.adsbygoogle",
  "[id^='google_ads']",
  "[id^='div-gpt-ad']",
  "iframe[src*='doubleclick.net']",
  ".ad-banner",
  ".ad-container",
  ".advert",
  "[aria-label='Advertisement']",
];

// Selectors that only apply on a given site (key = domain).
const PER_SITE = {
  "youtube.com": ["#masthead-ad", "ytd-ad-slot-renderer", "ytd-display-ad-renderer"],
};

(async () => {
  const api = typeof browser !== "undefined" ? browser : chrome;
  const host = location.hostname;

  const { allowlist = [] } = await api.storage.local.get("allowlist");
  if (allowlist.some((h) => host === h || host.endsWith("." + h))) return; // site is paused

  const selectors = [...GENERIC];
  for (const [domain, list] of Object.entries(PER_SITE)) {
    if (host === domain || host.endsWith("." + domain)) selectors.push(...list);
  }

  const style = document.createElement("style");
  style.textContent = selectors.join(",\n") + " { display: none !important; }";
  document.documentElement.appendChild(style);
})();
