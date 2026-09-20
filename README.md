# MyBlock

## Load it
Chrome/Brave/Edge: chrome://extensions > Developer mode > Load unpacked > pick this folder.
Zen/Firefox: about:debugging > This Firefox > Load Temporary Add-on > pick manifest.json.

## Layout
manifest.json        declares everything
rules/rules.json     network block rules (generated, do not hand-edit)
tools/filters.txt    YOUR filter list, edit this
tools/convert.js     filters.txt -> rules.json   (run: node tools/convert.js)
content.js           cosmetic filtering (hide leftover ad boxes)
background.js        badge counter + allowlist rules
popup/               toolbar popup with the per-site pause button

## Workflow
1. Add a line to tools/filters.txt
2. Run: node tools/convert.js
3. Click reload on the extension, then refresh the page
