// Runs in every page and frame at document_start.
//   1. Cosmetic filtering: hides ad boxes with CSS (data from cosmetic-data.js + your custom filters).
//   2. Element picker: click any element to hide it for good (started from the popup).
(() => {
  const api = typeof browser !== "undefined" ? browser : chrome;
  const host = location.hostname.toLowerCase();
  const isTop = window === window.top;
  const DATA = typeof MYBLOCK_COSMETIC !== "undefined" ? MYBLOCK_COSMETIC : { generic: [], sites: {} };

  // "a.b.example.com" -> ["a.b.example.com", "b.example.com", "example.com"]
  const chain = (() => {
    const p = host.split(".");
    const out = [];
    for (let i = 0; i < p.length - 1; i++) out.push(p.slice(i).join("."));
    return out.length ? out : [host];
  })();

  // ---------- 1. Cosmetic filtering ----------
  let style = null;
  let observer = null;

  function buildCSS(s) {
    const custom = s.customCosmetic || { generic: [], sites: {} };
    const picked = s.customSelectors || {};
    const list = [...DATA.generic, ...(custom.generic || [])];
    for (const d of chain) {
      list.push(...(DATA.sites[d] || []), ...((custom.sites || {})[d] || []), ...(picked[d] || []));
    }
    // One CSS rule per selector: a single invalid selector would otherwise cancel the whole list.
    return list.map((sel) => sel + "{display:none!important}").join("\n");
  }

  function removeStyle() {
    if (observer) { observer.disconnect(); observer = null; }
    if (style) { style.remove(); style = null; }
  }

  async function apply() {
    const s = await api.storage.local.get(["enabled", "allowlist", "customCosmetic", "customSelectors"]);
    const off = s.enabled === false || (s.allowlist || []).some((d) => chain.includes(d));
    if (off) return removeStyle();

    if (!style) {
      style = document.createElement("style");
      style.dataset.myblock = "1";
    }
    const css = buildCSS(s);
    if (style.textContent !== css) style.textContent = css;
    if (!style.isConnected) document.documentElement.appendChild(style);

    // Some pages delete stray <style> tags. Put ours back if that happens.
    if (!observer) {
      observer = new MutationObserver(() => {
        if (style && !style.isConnected) document.documentElement.appendChild(style);
      });
      observer.observe(document.documentElement, { childList: true });
    }
  }

  apply();
  api.storage.onChanged.addListener((changes, area) => { if (area === "local") apply(); });

  // ---------- 2. Element picker ----------
  api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === "start-picker") {
      if (isTop) startPicker();
      sendResponse({ ok: isTop });
    }
  });

  // Build a short CSS selector that matches exactly this element.
  function cssPath(el) {
    const parts = [];
    while (el && el.nodeType === 1 && el !== document.documentElement) {
      if (el.id && !/\d{4,}/.test(el.id)) { // ids with long numbers are usually auto-generated
        const idSel = "#" + CSS.escape(el.id);
        if (document.querySelectorAll(idSel).length === 1) {
          parts.unshift(idSel);
          return parts.join(" > ");
        }
      }
      let part = el.tagName.toLowerCase();
      const classes = [...el.classList].filter((c) => !/\d{3,}/.test(c)).slice(0, 2);
      part += classes.map((c) => "." + CSS.escape(c)).join("");
      const parent = el.parentElement;
      if (parent && parent.querySelectorAll(":scope > " + part).length > 1) {
        const sameTag = [...parent.children].filter((c) => c.tagName === el.tagName);
        part += `:nth-of-type(${sameTag.indexOf(el) + 1})`;
      }
      parts.unshift(part);
      const sel = parts.join(" > ");
      if (document.querySelectorAll(sel).length === 1) return sel;
      el = parent;
    }
    return parts.join(" > ");
  }

  function startPicker() {
    if (document.getElementById("__myblock_picker")) return;

    const overlay = document.createElement("div");
    overlay.id = "__myblock_picker";
    overlay.style.cssText = "all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;";
    const root = overlay.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        .box{position:fixed;pointer-events:none;display:none;background:rgba(211,47,47,.25);outline:2px solid #d32f2f}
        .hint{position:fixed;top:12px;left:50%;transform:translateX(-50%);pointer-events:none;
          font:13px system-ui,sans-serif;background:#222;color:#fff;padding:8px 14px;border-radius:6px}
        .panel{position:fixed;right:16px;bottom:16px;width:320px;display:none;box-sizing:border-box;
          font:13px system-ui,sans-serif;background:#fff;color:#222;border:1px solid #ccc;border-radius:8px;
          padding:12px;box-shadow:0 4px 16px rgba(0,0,0,.3)}
        textarea{width:100%;box-sizing:border-box;height:64px;font:12px monospace;margin:6px 0}
        .info{color:#555;margin-bottom:8px}
        button{padding:7px 10px;border:0;border-radius:5px;cursor:pointer;font-size:13px;background:#eee}
        button.hide{background:#d32f2f;color:#fff}
        .row{display:flex;gap:6px}
      </style>
      <div class="box"></div>
      <div class="hint">Click the element to hide. Esc to cancel.</div>
      <div class="panel">
        <b>Hide this element?</b>
        <textarea spellcheck="false"></textarea>
        <div class="info"></div>
        <div class="row">
          <button class="parent">Parent</button>
          <button class="hide">Hide</button>
          <button class="cancel">Cancel</button>
        </div>
      </div>`;

    const box = root.querySelector(".box");
    const hint = root.querySelector(".hint");
    const panel = root.querySelector(".panel");
    const input = root.querySelector("textarea");
    const info = root.querySelector(".info");
    let current = null;
    let locked = false;

    const ours = (e) => e.composedPath().includes(overlay);

    function place(el) {
      if (!el) { box.style.display = "none"; return; }
      const r = el.getBoundingClientRect();
      Object.assign(box.style, {
        display: "block", left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px",
      });
    }
    function check() { // update match count + highlight from the (possibly edited) selector
      try {
        const n = document.querySelectorAll(input.value).length;
        info.textContent = n + " element(s) match this selector";
        place(document.querySelector(input.value));
      } catch {
        info.textContent = "Invalid selector";
      }
    }

    const onMove = (e) => { if (!locked && !ours(e)) { current = e.target; place(current); } };
    const onClick = (e) => {
      if (ours(e)) return; // let our own buttons work
      e.preventDefault();
      e.stopPropagation();
      if (locked) return;
      current = e.target;
      locked = true;
      hint.style.display = "none";
      panel.style.display = "block";
      input.value = cssPath(current);
      check();
    };
    const swallow = (e) => { if (!ours(e)) { e.preventDefault(); e.stopPropagation(); } };
    const onKey = (e) => { if (e.key === "Escape") close(); };

    const events = [
      ["mousemove", onMove], ["click", onClick],
      ["mousedown", swallow], ["mouseup", swallow], ["pointerdown", swallow], ["keydown", onKey],
    ];
    events.forEach(([t, fn]) => window.addEventListener(t, fn, true));
    function close() {
      events.forEach(([t, fn]) => window.removeEventListener(t, fn, true));
      overlay.remove();
    }

    input.addEventListener("input", check);
    root.querySelector(".cancel").addEventListener("click", close);
    root.querySelector(".parent").addEventListener("click", () => {
      const p = current && current.parentElement;
      if (p && p !== document.documentElement) { current = p; input.value = cssPath(p); check(); }
    });
    root.querySelector(".hide").addEventListener("click", async () => {
      const sel = input.value.trim();
      if (!sel) return;
      try { document.querySelector(sel); } catch { info.textContent = "Invalid selector"; return; }
      const { customSelectors = {} } = await api.storage.local.get("customSelectors");
      const list = customSelectors[host] || (customSelectors[host] = []);
      if (!list.includes(sel)) list.push(sel);
      await api.storage.local.set({ customSelectors });
      close();
    });

    document.documentElement.appendChild(overlay);
  }
})();
