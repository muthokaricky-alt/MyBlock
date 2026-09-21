// Sanity checks used by CI and by you.  Run: node tools/validate.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const errors = [];
const fail = (m) => errors.push(m);
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const exists = (p) => fs.existsSync(path.join(ROOT, p));

// manifest and the files it points to
let manifest = {};
try { manifest = JSON.parse(read("manifest.json")); } catch (e) { fail("manifest.json: " + e.message); }
const refs = [
  manifest.action && manifest.action.default_popup,
  manifest.options_ui && manifest.options_ui.page,
  manifest.background && manifest.background.service_worker,
  ...((manifest.background && manifest.background.scripts) || []),
  ...Object.values(manifest.icons || {}),
  ...((manifest.declarative_net_request && manifest.declarative_net_request.rule_resources) || []).map((r) => r.path),
  ...(manifest.content_scripts || []).flatMap((c) => c.js || []),
].filter(Boolean);
refs.forEach((f) => { if (!exists(f)) fail("manifest references missing file: " + f); });

// network rules
const ALLOWED = ["block", "allow", "allowAllRequests"];
try {
  const rules = JSON.parse(read("rules/rules.json"));
  if (!Array.isArray(rules)) fail("rules.json must be an array");
  if (rules.length > 30000) fail("too many static rules: " + rules.length);
  const ids = new Set();
  rules.forEach((r) => {
    if (!Number.isInteger(r.id) || r.id < 1) fail("bad rule id: " + JSON.stringify(r));
    if (ids.has(r.id)) fail("duplicate rule id " + r.id);
    ids.add(r.id);
    if (!r.action || !ALLOWED.includes(r.action.type)) fail("rule " + r.id + ": bad action");
    if (!r.condition || !Object.keys(r.condition).length) fail("rule " + r.id + ": empty condition");
  });
  console.log(`rules.json: ${rules.length} rules`);
} catch (e) { fail("rules.json: " + e.message); }

// cosmetic data
try {
  const sandbox = {};
  vm.runInNewContext(read("cosmetic-data.js") + "\nthis.out = MYBLOCK_COSMETIC;", sandbox);
  const c = sandbox.out;
  if (!c || !Array.isArray(c.generic) || typeof c.sites !== "object") fail("cosmetic-data.js has the wrong shape");
  else console.log(`cosmetic-data.js: ${c.generic.length} generic, ${Object.keys(c.sites).length} sites`);
} catch (e) { fail("cosmetic-data.js: " + e.message); }

if (errors.length) { console.error("\nFAILED:\n - " + errors.join("\n - ")); process.exit(1); }
console.log("All checks passed.");
