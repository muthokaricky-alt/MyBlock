/*
 * Adblock Plus / uBlock-style filter parser.
 * Works in Node (require) and in the browser (window.ABP).
 *
 * parse(text) -> { rules, cosmetic: {generic, sites}, skipped: [{line, reason}] }
 * rules are Chrome declarativeNetRequest rules WITHOUT ids (the caller assigns them).
 */
(function (root) {
  "use strict";

  // ABP option name -> DNR resource type
  const TYPE_MAP = {
    script: "script", image: "image", stylesheet: "stylesheet", css: "stylesheet",
    subdocument: "sub_frame", frame: "sub_frame", xmlhttprequest: "xmlhttprequest",
    xhr: "xmlhttprequest", media: "media", font: "font", ping: "ping",
    websocket: "websocket", object: "object", other: "other",
  };

  // Cosmetic selectors that only uBlock/ABP's own engines understand. A browser can't run them as CSS.
  const BAD_SELECTOR = /(^\^)|:(?:-abp-[a-z-]+|has-text|contains|matches-css(?:-before|-after)?|matches-media|matches-path|xpath|upward|nth-ancestor|min-text-length|watch-attr|remove|style|others|if|if-not)\(/i;

  function parseNetwork(line) {
    let body = line;
    const exception = body.startsWith("@@");
    if (exception) body = body.slice(2);

    // Regex filters like /banner\d+/ need regexFilter (RE2, capped at 1000 rules). Skipped for now.
    const rm = body.match(/^\/(.+)\/(?:\$[^\/]*)?$/);
    if (rm && /[\\\[\](){}+?|^$]/.test(rm[1])) return { skip: "regex filter" };

    // Split "pattern$options"
    let pattern = body;
    let optString = "";
    const idx = body.lastIndexOf("$");
    if (idx !== -1 && /^[~a-z0-9_\-=,|.*:+\/]*$/i.test(body.slice(idx + 1))) {
      pattern = body.slice(0, idx);
      optString = body.slice(idx + 1);
    }

    const condition = {};
    let priority = exception ? 2 : 1;
    const types = [];
    const negTypes = [];
    let doc = false;

    for (const raw of optString.split(",")) {
      if (!raw) continue;
      const neg = raw.startsWith("~");
      const eq = raw.indexOf("=");
      const key = (eq === -1 ? raw : raw.slice(0, eq)).replace(/^~/, "").toLowerCase();
      const val = eq === -1 ? "" : raw.slice(eq + 1);

      if (TYPE_MAP[key]) {
        (neg ? negTypes : types).push(TYPE_MAP[key]);
      } else if (key === "third-party" || key === "3p") {
        condition.domainType = neg ? "firstParty" : "thirdParty";
      } else if (key === "first-party" || key === "1p") {
        condition.domainType = neg ? "thirdParty" : "firstParty";
      } else if (key === "match-case") {
        condition.isUrlFilterCaseSensitive = true;
      } else if (key === "important") {
        if (!exception) priority = 3;
      } else if (key === "document" || key === "doc") {
        doc = true;
      } else if (key === "domain") {
        for (const d of val.toLowerCase().split("|")) {
          if (!d) continue;
          if (d.includes("*")) return { skip: "entity domain (site.*)" };
          if (d.startsWith("~")) (condition.excludedInitiatorDomains ||= []).push(d.slice(1));
          else (condition.initiatorDomains ||= []).push(d);
        }
      } else if (key === "denyallow") {
        if (val.includes("*")) return { skip: "entity domain (site.*)" };
        condition.excludedRequestDomains = val.toLowerCase().split("|").filter(Boolean);
      } else {
        return { skip: "unsupported option: " + key };
      }
    }

    if (doc && !exception) return { skip: "$document block" };

    if (types.length) {
      condition.resourceTypes = types.filter((t) => !negTypes.includes(t));
      if (!condition.resourceTypes.length) return { skip: "empty type list" };
    } else if (negTypes.length) {
      condition.excludedResourceTypes = negTypes;
    }

    // ||example.com^  ->  requestDomains (fast and exact). Anything else -> urlFilter.
    const dm = pattern.match(/^\|\|([a-z0-9-]+(?:\.[a-z0-9-]+)+)\^?$/i);
    if (dm) {
      condition.requestDomains = [dm[1].toLowerCase()];
    } else {
      if (!/^[\x21-\x7e]+$/.test(pattern)) return { skip: "empty or non-ASCII pattern" };
      if (pattern.startsWith("||*")) return { skip: "bad pattern" };
      if (pattern.replace(/[*^|]/g, "").length < 3) return { skip: "pattern too broad" };
      condition.urlFilter = pattern;
    }

    let action;
    if (doc && exception) {
      action = { type: "allowAllRequests" };
      condition.resourceTypes = ["main_frame"];
      priority = 4;
    } else {
      action = { type: exception ? "allow" : "block" };
    }
    return { rule: { priority, action, condition } };
  }

  function parse(text, options) {
    const opts = Object.assign({ siteCosmetic: true }, options);
    const rules = [];
    const seen = new Set();
    const skipped = [];
    const generic = new Set();
    const sites = new Map();

    for (const raw of String(text).split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line[0] === "!" || line[0] === "[") continue;

      // Cosmetic: [domains]##selector  (also #@#, #?#, #$# which we skip)
      const cm = line.match(/^([^\s#]*)(#[@?$%]*#)(.*)$/);
      if (cm) {
        const [, dom, sep, sel] = cm;
        if (sep !== "##") { skipped.push({ line, reason: "cosmetic type " + sep }); continue; }
        if (!sel || sel.startsWith("+js(") || BAD_SELECTOR.test(sel)) {
          skipped.push({ line, reason: "procedural/scriptlet cosmetic" });
          continue;
        }
        const domains = dom ? dom.toLowerCase().split(",") : [];
        if (domains.some((d) => d.startsWith("~") || d.includes("*"))) {
          skipped.push({ line, reason: "cosmetic domain exclusion/entity" });
          continue;
        }
        if (!domains.length) generic.add(sel);
        else if (opts.siteCosmetic) {
          for (const d of domains) {
            if (!sites.has(d)) sites.set(d, new Set());
            sites.get(d).add(sel);
          }
        }
        continue;
      }

      const res = parseNetwork(line);
      if (res.skip) { skipped.push({ line, reason: res.skip }); continue; }
      const key = JSON.stringify(res.rule);
      if (seen.has(key)) continue;
      seen.add(key);
      rules.push(res.rule);
    }

    const siteObj = {};
    for (const [d, set] of sites) siteObj[d] = [...set];
    return { rules, cosmetic: { generic: [...generic], sites: siteObj }, skipped };
  }

  const api = { parse };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.ABP = api;
})(typeof self !== "undefined" ? self : globalThis);
