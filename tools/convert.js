// Converts filters.txt (ABP syntax) into rules/rules.json (Chrome DNR format).
// Run from the project folder:  node tools/convert.js
// Supported: ||domain^  and  ||domain^$third-party
// Ignored: comments (!), cosmetic filters (##), exceptions (@@). Add support as you learn.
const fs = require("fs");
const path = require("path");

const input = fs.readFileSync(path.join(__dirname, "filters.txt"), "utf8");
const rules = [];
let id = 1;

for (const raw of input.split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith("!") || line.includes("##") || line.startsWith("@@")) continue;

  const m = line.match(/^\|\|([a-z0-9.-]+)\^(?:\$(.+))?$/i);
  if (!m) {
    console.warn("Skipped (unsupported):", line);
    continue;
  }

  const [, domain, options] = m;
  const condition = { requestDomains: [domain] };
  if (options && options.split(",").includes("third-party")) {
    condition.domainType = "thirdParty";
  }
  rules.push({ id: id++, priority: 1, action: { type: "block" }, condition });
}

const out = path.join(__dirname, "..", "rules", "rules.json");
fs.writeFileSync(out, JSON.stringify(rules, null, 2));
console.log(`Wrote ${rules.length} rules to ${out}`);
