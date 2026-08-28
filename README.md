# Xtract Replies

Extract replies from X.com (Twitter) posts and comments from Instagram posts (beta), and export them as CSV or HTML.  
Ideal for researchers, journalists, and social media analysts.

## Features

- One-click extraction of replies on X.com and comments on Instagram (beta)
- Export as CSV or HTML with a shared filename pattern per platform
- Live progress and stop button
- Optional nested Instagram replies (popup setting)
- Privacy-first: all processing is local

## Installation

1. Download or clone this repository.
2. Go to `chrome://extensions` in your browser.
3. Enable "Developer mode".
4. Click "Load unpacked" and select this folder.

## Pack for Distribution

To create a Chrome Web Store–ready zip:

```bash
npm run pack
```

This syncs `manifest.json` version from `package.json` and writes `xtract-replies-{version}.zip` containing only extension runtime files (no `.cursor`, workspace, or source zips).

Upload that zip in the [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole). Store listing copy is in `chrome-store.desc.md`.

## Usage

### X.com

1. Navigate to any X.com post (`/status/` URL).
2. Click the Xtract button next to Grok / More.
3. Use the popup to extract and export replies.

### Instagram (beta)

1. Open a post modal or `/p/` permalink on instagram.com.
2. Click the Xtract button in the reaction row.
3. Use the popup to extract and export comments.

Instagram support is beta — layout changes may affect coverage on some views.

## License

MIT

## Author

[Siavashh Keshmiri](https://x.com/siavashh)
