// Downloads public filter lists into tools/lists/ (git-ignored).
// Usage:  node tools/fetch-lists.js            (both)
//         node tools/fetch-lists.js easylist
// Needs Node 18+ (built-in fetch). Then run: node tools/convert.js
const fs = require("fs");
const path = require("path");

const LISTS = {
  easylist: "https://easylist.to/easylist/easylist.txt",
  easyprivacy: "https://easylist.to/easylist/easyprivacy.txt",
};

(async () => {
  const wanted = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const names = wanted.length ? wanted : Object.keys(LISTS);
  const dir = path.join(__dirname, "lists");
  fs.mkdirSync(dir, { recursive: true });

  for (const name of names) {
    if (!LISTS[name]) { console.error("Unknown list:", name, "(choose from " + Object.keys(LISTS).join(", ") + ")"); continue; }
    const res = await fetch(LISTS[name]);
    if (!res.ok) { console.error(`${name}: HTTP ${res.status}`); continue; }
    const text = await res.text();
    fs.writeFileSync(path.join(dir, name + ".txt"), text);
    console.log(`${name}: saved ${(text.length / 1024).toFixed(0)} KB`);
  }
})();
