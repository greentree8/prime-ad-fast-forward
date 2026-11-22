# Prime Ad Fast-Forward

A Chrome extension that fast-forwards Amazon Prime Video ads you don't want to watch. When an ad you've flagged plays, it runs at 16× speed with the sound off, then returns to normal playback right before the show resumes.

You decide which ads get fast-forwarded:

- **Hotkey:** press **Alt/Option + S** during any ad to fast-forward the rest of that ad break.
- **Keywords:** list words, phrases or advertiser names. Any ad whose on-screen text or captions contain one of them is fast-forwarded automatically.
- **All ads:** optionally fast-forward every ad.

## Installation

There's no build step. The extension is plain JavaScript and loads directly into Chrome.

1. Clone or download this repository:
   ```sh
   git clone https://github.com/greentree8/prime-ad-fast-forward.git
   ```
   (Or click **Code → Download ZIP** on GitHub and unzip it.)
2. Open Chrome and go to `chrome://extensions`.
3. Turn on **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the `prime-ad-fast-forward` folder (the one containing `manifest.json`).
5. Optional: click the puzzle-piece icon in Chrome's toolbar and pin **Prime Ad Fast-Forward** for easy access to its settings.

To update after pulling new changes, click the reload icon on the extension's card in `chrome://extensions`, then reload any open Prime Video tabs.

It works in other Chromium browsers (Edge, Brave, etc.) the same way.

## Usage

### Settings

Click the extension's toolbar icon to open its settings. Changes are saved automatically.

| Setting | What it does |
|---|---|
| **Enabled** | Turns the extension on or off. |
| **Auto fast-forward** | *Ads matching my keywords* (default): only ads that match your list. *All ads*: every ad. *None*: only when you press the hotkey. |
| **Keywords / advertisers** | One per line, not case-sensitive. Matched against the ad's on-screen text and captions. |
| **Mute while fast-forwarding** | Silences ads while they're sped up (on by default). |
| **Speed** | 4×, 8× or 16× (16× is Chrome's maximum). |

### Watching

1. Start a show or movie on Prime Video (amazon.com or primevideo.com).
2. **Turn on subtitles/captions** in the Prime player if you're using keywords. Captions are where most of the ad's text comes from, so matching works much better with them on.
3. When an ad break starts:
   - If an ad matches a keyword (or you chose *All ads*), it fast-forwards automatically.
   - Otherwise, press **Alt/Option + S** to fast-forward the rest of the break.
   - Press **Alt/Option + S** again to cancel and watch the break normally.
4. A short message appears at the top of the screen when fast-forwarding starts and when normal playback resumes. It's also visible in fullscreen.

### How it returns to normal playback

The extension reads the ad countdown (e.g. "Ad 0:15"). It slows to normal speed about 2 seconds before the ad ends, so you don't miss the start of the show. Those final 2 seconds of the ad stay muted.

Speed and sound go back to normal the moment the countdown disappears. If another ad's countdown appears within about a second (as happens between back-to-back ads), fast-forwarding picks back up.

### Manual fallback

If you press **Alt/Option + S** when the extension can't see an ad, it switches to manual fast-forward. Whatever is playing runs sped up until you press the hotkey again. This is useful if Prime changes its page design and ad detection stops working.

## Limitations

- **It fast-forwards; it doesn't skip.** Prime Video doesn't let you jump past ads. At 16×, a 30-second ad takes about 2 seconds.
- **Keyword matching reacts once text appears.** You may see the first moment of an ad before it's caught. Ads with no captions or on-screen text can't be matched; use the hotkey for those.
- **A match fast-forwards the whole ad break.** Prime doesn't reliably show where one ad ends and the next begins.
- **Prime Video's page design changes over time.** If ads stop being detected, update the page-element lists (`AD_INDICATOR_SELECTORS`, `AD_TEXT_SELECTORS`, `CAPTION_SELECTORS`) at the top of `content.js`. Use Chrome DevTools (right-click the ad countdown → **Inspect**) to find the current class names.

## Files

| File | Purpose |
|---|---|
| `manifest.json` | Extension configuration (Manifest V3). |
| `content.js` | Runs on Prime Video pages: detects ads, matches keywords, controls playback speed and sound, handles the hotkey. |
| `popup.html`, `popup.js` | The settings popup. |

## Privacy

Everything runs locally in your browser. Your settings are stored with `chrome.storage.sync`, so they follow your Chrome profile. Nothing is collected or sent anywhere.
