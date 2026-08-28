# Chrome Web Store listing copy — Xtract Replies 1.1.0

Use these blocks in the Developer Dashboard. Keep the short description under 132 characters.

---

## Short description

Extract replies from any X.com post and export CSV/HTML. Local-only, privacy-first, no account required.

---

## Detailed description

Xtract Replies extracts replies from public X.com (Twitter) posts and exports them as CSV or HTML — entirely in your browser.

Built by Miraxle for researchers, journalists, marketers, and anyone who needs clean reply data without leaving X.com.

Open source: https://github.com/siavashh/xtract-replies

WHY XTRACT REPLIES

• One-click extraction — Click the Xtract icon next to Grok / More on any post. No Xtract account required.
• Toolbar popup — Progress, Stop, and downloads live under the Chrome toolbar icon (with a live badge while loading).
• Full reply details — Username, handle, timestamp, reply URL, text (emoji + RTL), likes, replies, and views.
• Smart thread handling — Expands “Show additional replies”, skips the main post, and stops before “Discover more” / recommended posts.
• Fast local exports — CSV for spreadsheets; HTML with a modern report, main-tweet summary, and clickable column sorting.
• Privacy-first — Extraction stays on your device. No analytics. No telemetry of tweet content.

HOW TO USE

1. Install Xtract Replies from the Chrome Web Store.
2. Open any public post on x.com (a /status/ URL).
3. Click the Xtract icon under the tweet (top-right, next to Grok).
4. Watch progress in the toolbar popup; use Stop anytime.
5. Download CSV or HTML when finished.

SAMPLE USE CASES

• Academic research and discourse analysis
• Journalism and public-reaction reporting
• Social listening and campaign audits
• Archiving important threads
• Structured exports for dashboards or notebooks

WHO IT’S FOR

Researchers, journalists, marketers, analysts, developers, and power users who work with X conversations.

PRIVACY & PERMISSIONS

• Local processing only — extracted replies are not sent to Xtract/Miraxle servers.
• storage — temporary session state so the popup can show progress if closed and reopened.
• Host access to https://x.com/* — required to read the post page you are viewing.
• Full privacy policy: see PRIVACY.md in the project / store listing privacy field.

Exported HTML may load the Vazirmatn font from Google Fonts only when you open a file you downloaded — not during extraction.

PRO TIPS

• Large threads: let it finish, or hit Stop and export a partial set.
• Pin the extension icon so the popup and badge are easy to find.
• After updating the extension, refresh the X.com tab so the content script reloads.

KNOWN LIMITATIONS

• X.com layout changes can break selectors; updates ship as needed.
• Very large threads may load slowly as X throttles infinite scroll — use Stop if needed.

CONTACT

• @siavashh on X: https://x.com/siavashh
• Miraxle: https://miraxle.com
• GitHub issues / PRs: https://github.com/siavashh/xtract-replies

---

## What’s new in 1.1.0

• Reliable toolbar popup + live badge (fixes Chrome popup blocking)
• Window/scroll loading that actually fetches more replies
• Stops at “Discover more” (no recommended posts mixed into replies)
• Single Xtract button next to Grok (no duplicate under the tweet)
• Refreshed popup UI and HTML export (gradients, sorting, Vazirmatn)
• Cleaner store packaging and updated privacy policy

---

## Store single-purpose / permission justifications (paste if asked)

Single purpose: Extract public replies from X.com posts the user is viewing and export them locally as CSV or HTML.

storage: Holds temporary extraction progress in chrome.storage.session so the toolbar popup can restore status/counts if closed mid-run. Cleared with the browser session.

Host permission https://x.com/*: Content script runs only on post pages to read the DOM and collect replies the user explicitly requested.

---

© 2026 Siavashh Keshmiri · Miraxle · Built for X lovers
