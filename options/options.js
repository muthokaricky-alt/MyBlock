const api = typeof browser !== "undefined" ? browser : chrome;
const $ = (id) => document.getElementById(id);
const MAX_CUSTOM_RULES = 5000;

async function load() {
  const { customFilters = "", lastRuleError = "" } = await api.storage.local.get(["customFilters", "lastRuleError"]);
  $("filters").value = customFilters;
  if (lastRuleError) showMsg("Browser rejected a custom rule: " + lastRuleError, true);
  renderPicked();
}

function showMsg(text, isError) {
  $("msg").textContent = text;
  $("msg").className = isError ? "err" : "";
}

$("save").addEventListener("click", async () => {
  const text = $("filters").value;
  const parsed = ABP.parse(text);
  let rules = parsed.rules;
  if (rules.length > MAX_CUSTOM_RULES) {
    showMsg(`Too many rules (${rules.length}). Only the first ${MAX_CUSTOM_RULES} are used.`, true);
    rules = rules.slice(0, MAX_CUSTOM_RULES);
  }

  // Drop cosmetic selectors this browser can't parse, so they can't do harm.
  const valid = (sel) => { try { document.createDocumentFragment().querySelector(sel); return true; } catch { return false; } };
  const cosmetic = {
    generic: parsed.cosmetic.generic.filter(valid),
    sites: Object.fromEntries(Object.entries(parsed.cosmetic.sites).map(([d, l]) => [d, l.filter(valid)])),
  };

  await api.storage.local.set({ customFilters: text, customRules: rules, customCosmetic: cosmetic });
  await api.runtime.sendMessage({ type: "rebuild" });

  const { lastRuleError = "" } = await api.storage.local.get("lastRuleError");
  const nCos = cosmetic.generic.length + Object.values(cosmetic.sites).reduce((a, l) => a + l.length, 0);
  if (lastRuleError) showMsg("Browser rejected a rule: " + lastRuleError, true);
  else showMsg(`Saved: ${rules.length} network rules, ${nCos} cosmetic filters, ${parsed.skipped.length} skipped.`);

  const pre = $("skipped");
  pre.hidden = !parsed.skipped.length;
  pre.textContent = parsed.skipped.map((s) => `${s.reason}: ${s.line}`).join("\n");
});

async function renderPicked() {
  const { customSelectors = {} } = await api.storage.local.get("customSelectors");
  const box = $("picked");
  box.textContent = "";
  const hosts = Object.keys(customSelectors).filter((h) => customSelectors[h].length);
  if (!hosts.length) { box.textContent = "Nothing yet. Use the popup's Pick an element button on any page."; return; }
  for (const h of hosts) {
    const title = document.createElement("h3");
    title.textContent = h;
    const ul = document.createElement("ul");
    for (const sel of customSelectors[h]) {
      const li = document.createElement("li");
      li.textContent = sel;
      const del = document.createElement("button");
      del.className = "small";
      del.textContent = "Remove";
      del.addEventListener("click", async () => {
        customSelectors[h] = customSelectors[h].filter((s) => s !== sel);
        await api.storage.local.set({ customSelectors });
        renderPicked();
      });
      li.appendChild(del);
      ul.appendChild(li);
    }
    box.append(title, ul);
  }
}

load();
