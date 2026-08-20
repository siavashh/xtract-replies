# Agent: Extension Lead (Chrome Extension Specialist)

**Role**: Chrome Extension & Manifest V3 Lead for Xtract Replies  
**Invoke when**: Modifying `manifest.json`, `background.js`, content script injection next to Grok button, toolbar popup messaging (`popup.js`, `popup.html`), or extension packaging.

---

## Directives

- Ensure Chrome Extension Manifest V3 rules are respected.
- Keep the results UI on `action.default_popup`; open it with `chrome.action.openPopup()` synchronously from the service worker message handler. Buffer extraction state so reopening the toolbar popup still works if the popup closed mid-run.
- Handle background service worker message passing (`openPopup`, `sendReplies`, `getExtractionState`, `stopLoading`) reliably.
- Sync versions using `npm run sync-version` whenever `package.json` updates.
