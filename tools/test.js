// Tiny test suite for the parser.  Run: node tools/test.js
const assert = require("assert");
const { parse } = require("../lib/abp.js");

const one = (line) => parse(line).rules[0];
let n = 0;
const test = (name, fn) => { fn(); n++; console.log("ok  " + name); };

test("domain block uses requestDomains", () => {
  const r = one("||doubleclick.net^");
  assert.deepStrictEqual(r, { priority: 1, action: { type: "block" }, condition: { requestDomains: ["doubleclick.net"] } });
});
test("third-party option", () => {
  assert.strictEqual(one("||ads.example.com^$third-party").condition.domainType, "thirdParty");
  assert.strictEqual(one("||ads.example.com^$~third-party").condition.domainType, "firstParty");
});
test("path filter with resource types", () => {
  const c = one("||example.com/ads/*$script,image").condition;
  assert.strictEqual(c.urlFilter, "||example.com/ads/*");
  assert.deepStrictEqual(c.resourceTypes, ["script", "image"]);
});
test("negated types", () => {
  assert.deepStrictEqual(one("/track.gif$~script").condition.excludedResourceTypes, ["script"]);
});
test("exception becomes allow with higher priority", () => {
  const r = one("@@||example.com^$script");
  assert.strictEqual(r.action.type, "allow");
  assert.strictEqual(r.priority, 2);
});
test("important raises priority", () => {
  assert.strictEqual(one("||x.com^$important").priority, 3);
});
test("domain= splits into initiator lists", () => {
  const c = one("/banner/ads.$domain=a.com|~b.com").condition;
  assert.deepStrictEqual(c.initiatorDomains, ["a.com"]);
  assert.deepStrictEqual(c.excludedInitiatorDomains, ["b.com"]);
});
test("$document exception -> allowAllRequests", () => {
  const r = one("@@||example.com^$document");
  assert.strictEqual(r.action.type, "allowAllRequests");
  assert.deepStrictEqual(r.condition.resourceTypes, ["main_frame"]);
});
test("unsupported lines are skipped with a reason", () => {
  const res = parse("||x.com^$redirect=noopjs\n/ad\\d+/\n||y.com^$popup");
  assert.strictEqual(res.rules.length, 0);
  assert.strictEqual(res.skipped.length, 3);
});
test("plain path like /ads/ is not treated as regex", () => {
  assert.strictEqual(one("/ads/$script").condition.urlFilter, "/ads/");
});
test("overly broad patterns are refused", () => {
  assert.strictEqual(parse("*$third-party").rules.length, 0);
});
test("comments and headers ignored, duplicates removed", () => {
  assert.strictEqual(parse("[Adblock Plus 2.0]\n! hi\n||a.com^\n||a.com^").rules.length, 1);
});
test("generic and site cosmetic filters", () => {
  const c = parse("##.ad\nexample.com,foo.org##.box\nexample.com###masthead").cosmetic;
  assert.deepStrictEqual(c.generic, [".ad"]);
  assert.deepStrictEqual(c.sites["example.com"], [".box", "#masthead"]);
  assert.deepStrictEqual(c.sites["foo.org"], [".box"]);
});
test("procedural cosmetic filters are skipped", () => {
  const res = parse("example.com##.x:has-text(Ad)\nexample.com#?#.y\n##+js(nobab)");
  assert.strictEqual(res.cosmetic.generic.length, 0);
  assert.strictEqual(res.skipped.length, 3);
});
console.log(`\n${n} tests passed`);
