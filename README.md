# Xtract Replies

Extract replies from X.com (Twitter) posts and export them as CSV or HTML.  
Ideal for researchers, journalists, and social media analysts.

## Features

- One-click extraction of all replies to any public X.com post
- Export as CSV or HTML
- Live progress and stop button
- Privacy-first: all processing is local

## Installation

1. Download or clone this repository.
2. Go to `chrome://extensions` in your browser.
3. Enable "Developer mode".
4. Click "Load unpacked" and select this folder.

## Pack for Distribution

To create a distributable version of the extension:

1. Navigate to the extension folder.
2. Run the following command in your terminal:
   ```bash
   zip -r xtract-replies.zip . -x ".*" -x "__MACOSX"
   ```
3. This will create a `xtract-replies.zip` file that you can distribute.

## Usage

1. Navigate to any X.com post.
2. Click the Xtract button next to the main tweet.
3. Use the popup to extract and export replies.

## License

MIT

## Author

[Siavashh Keshmiri](https://x.com/siavashh)
