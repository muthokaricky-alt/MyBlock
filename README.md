# MyBlock

[![Validate](https://github.com/muthokaricky-alt/MyBlock/actions/workflows/validate.yml/badge.svg)](https://github.com/muthokaricky-alt/MyBlock/actions/workflows/validate.yml)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)
![License: MIT](https://img.shields.io/badge/license-MIT-green)

A lightweight ad blocker for Chromium browsers and Firefox-based browsers (Zen), built from scratch as a learning project and modeled on the architecture of uBlock Origin.

![MyBlock popup](docs/screenshot.png)

## Features

| Feature | What it does |
|---|---|
| Network blocking | Stops requests to ad and tracker domains before they load, using Manifest V3 declarativeNetRequest |
| Real filter syntax | Reads Adblock Plus / EasyList style filters, including resource types, `$third-party`, `$domain=`, `$important` and `@@` exceptions |
| Cosmetic filtering | Hides leftover ad boxes with CSS, from the same filter list |
| Element picker | Click any element on a page to hide it permanently |
| Controls | Global on/off switch and per-site pause in the popup |
| Stats | Blocked count on the toolbar badge and per page in the popup |
| Settings page | Write custom filters in the browser and manage picked elements |

## Quick start

```
git clone https://github.com/muthokaricky-alt/MyBlock.git
```

**Chrome / Brave / Edge**
1. Open `chrome://extensions` (or `brave://extensions`, `edge://extensions`).
2. Turn on **Developer mode**.
3. Click **Load unpacked** and select the project folder.

**Zen / Firefox**
1. Open `about:debugging` and click **This Firefox**.
2. Click **Load Temporary Add-on** and select `manifest.json`.
3. Temporary add-ons are removed when the browser closes, so reload it each session.

## Using it

Click the toolbar icon to:

- **Pause on this site** or **Resume blocking** for the current site (the page reloads).
- **Pick an element to hide**: click the element, optionally press **Parent** to widen the selection or edit the selector, then press **Hide**.
- Switch MyBlock off everywhere with the toggle in the header.
- Open **Settings** to add custom filters or remove elements you hid.

## Writing filters

Add filters to `tools/filters.txt`, then compile them:

```
node tools/convert.js
```

Reload the extension and refresh the page. Quick personal filters can also go on the Settings page, where they apply immediately on save.

| Syntax | Meaning |
|---|---|
| `\|\|example.com^` | Block a domain and its subdomains |
| `\|\|example.com/ads/*` | Block by URL pattern (`*` wildcard, `^` separator, `\|` anchor) |
| `$script`, `$image`, `$stylesheet`, `$subdocument`, `$xmlhttprequest`, `$media`, `$font`, `$ping`, `$websocket`, `$object`, `$other` | Limit to resource types (`~script` excludes one) |
| `$third-party`, `$~third-party` | Third-party or first-party requests only |
| `$domain=a.com\|~b.com` | Only on (or not on) certain sites |
| `$important` | Wins over exceptions |
| `$match-case`, `$denyallow=` | Case-sensitive match, allowed request domains |
| `@@\|\|example.com^` | Exception (allow) |
| `@@\|\|example.com^$document` | Turn blocking off for a whole site |
| `##.selector` | Hide an element everywhere |
| `example.com##.selector` | Hide an element on one site |
| `! comment` | Comment |

Not supported yet (skipped with a warning): regex filters, `$redirect`, `$removeparam`, `$csp`, `$popup`, scriptlets (`##+js`), procedural cosmetics (`:has-text`, `:-abp-has`) and cosmetic exceptions (`#@#`).

### Using a real filter list

```
node tools/fetch-lists.js easylist
node tools/convert.js
```

Downloaded lists go in `tools/lists/` (git-ignored) and are compiled together with your own filters. By default only generic cosmetic filters are taken from downloaded lists, to keep pages fast; add `--full-cosmetic` to include site-specific ones. Add `--verbose` to see every skipped line.

EasyList is licensed GPLv3 / CC BY-SA 3.0. If you commit rules compiled from it, credit it and keep that license in mind.

## How it works

```
tools/filters.txt ──► tools/convert.js ──┬─► rules/rules.json     ──► browser blocks requests
   (+ downloaded lists)   (lib/abp.js)   └─► cosmetic-data.js     ──► content.js hides elements

popup / settings ──► chrome.storage ──► background.js ──► dynamic rules (allowlist, custom filters)
                                   └──► content.js      ──► picked elements applied live
```

- The browser enforces `rules/rules.json` itself, so the extension never sees your browsing. That is the privacy benefit of Manifest V3.
- `content.js` injects one CSS rule per selector, so a single invalid selector can't break the rest. A MutationObserver restores the style if a page removes it.
- Pausing a site or saving custom filters rebuilds the dynamic rules in `background.js`.

## Project structure

```
manifest.json         Extension config
background.js        Service worker: allowlist, global switch, custom rules
content.js           Cosmetic filtering and the element picker
cosmetic-data.js     GENERATED cosmetic selectors (do not hand-edit)
rules/rules.json     GENERATED network rules (do not hand-edit)
lib/abp.js           Filter parser, shared by convert.js and the settings page
popup/               Toolbar popup
options/             Settings page
icons/               Extension icons
tools/filters.txt    YOUR filter list
tools/convert.js     Compiles filters into the generated files
tools/fetch-lists.js Downloads EasyList / EasyPrivacy into tools/lists/
tools/test.js        Parser tests
tools/validate.js    Checks manifest, rules and cosmetic data
```

## Testing

Run the automated checks (the same ones GitHub Actions runs on every push):

```
node tools/test.js
node tools/convert.js
node tools/validate.js
```

Manual checks in the browser:

1. **Block test**: on any page, open DevTools > Console and run:

```
fetch("https://doubleclick.net/").catch(e => console.log("blocked:", e.message))
```

2. **Cosmetic test**: the red box should not appear.

```
document.body.insertAdjacentHTML("beforeend", "<div class='ad-banner' style='position:fixed;top:0;left:0;background:red;padding:20px'>TEST AD</div>")
```

3. **Picker test**: pick an element, press **Hide**, refresh. It stays hidden. Remove it on the Settings page.
4. **Pause and global switch**: pause a site or switch MyBlock off, then repeat the block test. It should now succeed.
5. **Custom filters**: on the Settings page add `||example.org^`, save, and confirm requests to it are blocked.

Chrome's console blocks pasting until you type `allow pasting` once. If a change seems to do nothing, click the reload icon on the extensions page and refresh the tab.

### Zen / Firefox

The Chrome-specific APIs are wrapped so the extension should still load, but it has not been verified in Firefox yet. Check that the popup and Settings page open, the block test works, pausing works and the picker works. The toolbar badge and the per-page count may not exist there; both hide themselves if unsupported.

## Known limitations

- Ads served from the same domain as the content (such as YouTube video ads) can't be stopped by network rules. uBlock Origin uses script injection for these.
- Static rules are capped at 30,000, so a full EasyList is trimmed to fit (exceptions and `$important` rules are kept first).
- Cosmetic filtering is selector-based and can miss ads with random class names.
- The popup's per-page count includes matches from exception rules, so it can be slightly off.

## Roadmap

- [x] Resource types, `$domain=`, `$important`, `@@` exceptions
- [x] Cosmetic filters compiled from the filter list
- [x] Element picker, settings page, global switch, icons
- [x] EasyList import and CI checks
- [ ] Regex filters
- [ ] Cosmetic exceptions (`#@#`)
- [ ] Scriptlet injection for same-domain ads
- [ ] Verified Firefox build

## Credits

Inspired by [uBlock Origin](https://github.com/gorhill/uBlock). Filter syntax follows the Adblock Plus format.

## License

MIT. See [LICENSE](LICENSE).
