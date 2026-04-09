# Install the FullHangar extension in the Controller Chrome profile

1. Start the dedicated browser: run `scripts/launch-chrome-controller.ps1` (or `npm run chrome:controller` from the repo root).
2. In that Chrome window, open `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and choose the repo’s `browser-extension` folder.
5. The extension is stored in the FullHangar profile (`%USERPROFILE%\AppData\Local\FullHangar\ChromeProfile`), so it stays installed each time you launch with the same script. Leave this Chrome window open between scrape runs so the Distil session stays warm.
