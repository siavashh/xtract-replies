# Chrome Web Store listing copy — Xtract Replies 1.3.0

Use these blocks in the Developer Dashboard. Keep the short description under 132 characters.

---

## Short description

Extract X.com replies and Instagram comments (beta). Export CSV/HTML locally. Privacy-first, no account required.

---

## Detailed description

Xtract Replies extracts replies from public X.com (Twitter) posts and comments from Instagram posts — and exports them as CSV or HTML, entirely in your browser.

Built by Miraxle for researchers, journalists, marketers, and anyone who needs clean conversation data without leaving the page.

Open source: https://github.com/siavashh/xtract-replies

WHY XTRACT REPLIES

• One-click extraction — Click the Xtract icon on any X.com post (next to Grok / More) or Instagram post (in the reaction row). No Xtract account required.
• Toolbar popup — Progress, Stop, and downloads live under the Chrome toolbar icon (with a live badge while loading).
• Full reply / comment details — Username, handle, timestamp, URL, text (emoji + RTL), likes, and more.
• Smart loading — X: expands hidden replies and stops before “Discover more”. Instagram: scrolls the comments column and clicks “Load more comments” where available.
• Fast local exports — CSV for spreadsheets; HTML with a modern report, main-post summary, and clickable column sorting.
• Privacy-first — Extraction stays on your device. No analytics. No telemetry of post content.

INSTAGRAM (BETA)

Instagram comment extraction is available in beta. It works on post modals and /p/ permalink pages, but Instagram’s layout changes frequently — coverage may vary on some views. Feedback welcome via GitHub or @siavashh.

HOW TO USE — X.COM

1. Install Xtract Replies from the Chrome Web Store.
2. Open any public post on x.com (a /status/ URL).
3. Click the Xtract icon under the tweet (top-right, next to Grok).
4. Watch progress in the toolbar popup; use Stop anytime.
5. Download CSV or HTML when finished.

HOW TO USE — INSTAGRAM (BETA)

1. Open a public Instagram post (feed modal or instagram.com/p/… permalink).
2. Click the Xtract icon in the reaction row (Like / Comment / Share area).
3. Wait while comments load; use Stop for a partial export if needed.
4. Download CSV or HTML from the toolbar popup.

SAMPLE USE CASES

• Academic research and discourse analysis
• Journalism and public-reaction reporting
• Social listening and campaign audits
• Archiving important threads and comment threads
• Structured exports for dashboards or notebooks

WHO IT’S FOR

Researchers, journalists, marketers, analysts, developers, and power users who work with X and Instagram conversations.

PRIVACY & PERMISSIONS

• Local processing only — extracted data is not sent to Xtract/Miraxle servers.
• storage — temporary session state so the popup can show progress if closed and reopened.
• Host access to https://x.com/* and https://www.instagram.com/* — required to read the post page you are viewing.
• Full privacy policy: see PRIVACY.md in the project / store listing privacy field.

Exported HTML may load the Vazirmatn font from Google Fonts only when you open a file you downloaded — not during extraction.

PRO TIPS

• Large threads: let it finish, or hit Stop and export a partial set.
• Pin the extension icon so the popup and badge are easy to find.
• After updating the extension, refresh the X.com or Instagram tab so the content script reloads.
• Instagram beta: toggle “Include nested Instagram replies” in the popup before extracting if you need reply threads.

KNOWN LIMITATIONS

• X.com and Instagram layout changes can break selectors; updates ship as needed.
• Instagram extraction is beta — some post layouts, reels, or heavily nested threads may be incomplete.
• Very large threads may load slowly as platforms throttle scroll — use Stop if needed.

CONTACT

• @siavashh on X: https://x.com/siavashh
• Miraxle: https://miraxle.com
• GitHub issues / PRs: https://github.com/siavashh/xtract-replies

---

## What’s new in 1.3.0

• Responsive HTML export for mobile — compact reply cards, readable on phones
• Xtract button sits next to Grok (not under the More menu)
• Hide “Include nested Instagram replies” on X.com (Instagram only)
• Fix empty X HTML exports caused by nested-reply filtering
• Clearer storage / host-permission justifications for Web Store review

## What’s new in 1.2.0

• Instagram comment extraction (beta) — modals and /p/ permalink pages
• Xtract button in Instagram reaction row; scroll + load-more for large comment threads
• Optional nested Instagram replies (popup setting; off by default)
• Shared export filename pattern for X and Instagram (Xtract-{x|ig}--{handle}--{date}-{time})
• Updated privacy policy and store listing for Instagram host permission

---

## Store single-purpose / permission justifications (paste if asked)

Single purpose: Extract public replies from X.com posts and public comments from Instagram posts the user is viewing, and export them locally as CSV or HTML.

storage: storage is used only for local extension state. chrome.storage.session holds the current extraction (status, reply/comment count, extracted rows, and the source tab id) so the toolbar popup and badge can restore progress if the popup is closed mid-run. That data stays on the device and is cleared when the browser session ends. chrome.storage.sync stores one user preference: whether to include nested Instagram replies (default off). We do not store credentials, browsing history, or analytics, and we do not send stored data to any server.

Host permission justification: Host permissions are limited to https://x.com/* and https://www.instagram.com/*. On X, a content script (main.js) injects an "Xtract" button on post pages, reads reply data from the DOM (usernames, timestamps, text, engagement stats), and sends it to the background script for local CSV/HTML export. On Instagram, a content script (instagram.js) injects the same button in the post reaction row (feed modals and /p/ permalinks; beta), extracts public comments the user requested, and uses the same local export path. The extension does not run on other sites and does not send extracted content to our servers.

---

© 2026 Siavashh Keshmiri · Miraxle · Built for X lovers
