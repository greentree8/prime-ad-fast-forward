// Prime Ad Fast-Forward — content script
(() => {
  const DEFAULTS = {
    enabled: true,
    mode: "keywords",        // "keywords" | "all" | "manual"
    keywords: [],            // lowercase strings
    speed: 16,               // Chrome's max playbackRate is 16
    mute: true,
    hotkey: "KeyS"           // used with Alt/Option: Alt+S
  };
  let settings = { ...DEFAULTS };

  // Timing
  const TICK_IDLE_MS = 200;  // check rate when not fast-forwarding
  const TICK_FF_MS = 50;     // check rate while fast-forwarding (16x * 50ms = 0.8s of video per tick)
  const GRACE_MS = 1000;     // countdown must be gone this long before the break counts as over
  // Drop to 1x when this many ad-seconds remain. Covers the countdown's whole-second
  // rounding (~1s) plus how far the video moves between two fast ticks.
  const endMargin = () => 1.5 + settings.speed * (TICK_FF_MS / 1000);

  // Prime Video class names change over time; these cover known variants.
  const AD_INDICATOR_SELECTORS = [
    ".atvwebplayersdk-ad-timer",
    ".atvwebplayersdk-ad-timer-text",
    ".atvwebplayersdk-adtimeindicator-text",
    "[class*='adtimeindicator']",
    "[class*='ad-timer']",
    "[class*='AdTimer']"
  ];
  const AD_TEXT_SELECTORS = [
    "[class*='ad-timer']",
    "[class*='adtimeindicator']",
    "[class*='ad-info']",
    "[class*='AdInfo']",
    "[class*='sponsored']"
  ];
  const CAPTION_SELECTORS = [
    ".atvwebplayersdk-captions-text",
    "[class*='captions-text']"
  ];

  // --- State ---
  let ffActive = false;      // playbackRate is currently boosted
  let saved = null;          // { rate, muted } to restore afterwards
  let manualFF = false;      // user forced FF while no ad was detected

  let breakActive = false;   // we are inside an ad break
  let breakSkip = null;      // null = undecided, string = reason we're skipping, false = user cancelled
  let adGoneAt = null;       // when the countdown disappeared (for the grace period)
  let adTextSeen = "";
  let lastTimerText = "";
  let adEnd = null;          // { video, time } — video.currentTime at which the current ad ends

  function loadSettings() {
    chrome.storage.sync.get(DEFAULTS, (s) => { settings = { ...DEFAULTS, ...s }; });
  }
  loadSettings();
  chrome.storage.onChanged.addListener(loadSettings);

  // --- DOM helpers ---
  function isVisible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && cs.opacity !== "0";
  }

  function getVideo() {
    // Pick the largest visible video that has data.
    const vids = [...document.querySelectorAll("video")]
      .filter(v => v.readyState >= 2 && isVisible(v));
    if (!vids.length) return null;
    return vids.sort((a, b) => {
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      return rb.width * rb.height - ra.width * ra.height;
    })[0];
  }

  // Returns the visible countdown element's text, or null if no ad is showing.
  function getAdIndicatorText() {
    for (const sel of AD_INDICATOR_SELECTORS) {
      for (const el of document.querySelectorAll(sel)) {
        const t = el.textContent.trim();
        if (t && isVisible(el)) return t;
      }
    }
    return null;
  }

  // "Ad 0:15", "Ad 1 of 2 · 0:15", "1:02" → seconds remaining; "15s" also accepted.
  function parseRemaining(text) {
    const mmss = [...text.matchAll(/(\d+):(\d{2})/g)].pop();
    if (mmss) return Number(mmss[1]) * 60 + Number(mmss[2]);
    const secs = text.match(/(\d+)\s*s(ec)?\b/i);
    return secs ? Number(secs[1]) : null;
  }

  function collectText(selectors) {
    const parts = [];
    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach(el => { if (isVisible(el)) parts.push(el.textContent); });
    }
    return parts.join(" ").toLowerCase();
  }

  function keywordHit(text) {
    return settings.keywords.find(k => k && text.includes(k));
  }

  // --- Playback control ---
  function speedUp(video) {
    if (!ffActive) {
      // Keep the original settings if we're re-boosting after a soft landing
      // (video is still muted by us at that point).
      if (!saved) saved = { rate: video.playbackRate || 1, muted: video.muted };
      ffActive = true;
    }
    if (video.playbackRate !== settings.speed) video.playbackRate = settings.speed;
    if (settings.mute && !video.muted) video.muted = true;
  }

  // Back to normal speed. keepMuted = stay silent for the last moment of the ad.
  function slowDown(video, keepMuted) {
    if (!ffActive) return;
    ffActive = false;
    if (video && saved) {
      video.playbackRate = saved.rate === settings.speed ? 1 : saved.rate;
      if (!keepMuted) { video.muted = saved.muted; saved = null; }
    }
  }

  function restoreAudio(video) {
    if (video && saved && !ffActive) video.muted = saved.muted;
    if (!ffActive) saved = null;
  }

  function endBreak(video) {
    const wasSkipping = typeof breakSkip === "string";
    slowDown(video, false);
    restoreAudio(video);
    breakActive = false;
    breakSkip = null;
    adGoneAt = null;
    adTextSeen = "";
    lastTimerText = "";
    adEnd = null;
    if (wasSkipping) toast("▶ Ad break over — normal playback");
  }

  // --- Main loop ---
  function tick() {
    const video = getVideo();
    if (!video) return;

    if (!settings.enabled) { manualFF = false; if (breakActive || ffActive) endBreak(video); return; }

    if (manualFF) { speedUp(video); return; }

    const timerText = getAdIndicatorText();

    if (timerText !== null) {
      // --- Ad is showing ---
      breakActive = true;
      adGoneAt = null;

      // Accumulate ad text over the break (captions appear over time).
      const now = collectText(AD_TEXT_SELECTORS) + " " + collectText(CAPTION_SELECTORS);
      if (now.trim() && !adTextSeen.includes(now)) adTextSeen += " " + now;

      // Decide whether to skip this break.
      if (breakSkip === null) {
        let reason = null;
        if (settings.mode === "all") reason = "skip-all mode";
        else if (settings.mode === "keywords") {
          const hit = keywordHit(adTextSeen);
          if (hit) reason = `matched "${hit}"`;
        }
        if (reason) { breakSkip = reason; toast(`⏩ Fast-forwarding ad (${reason})`); }
      }

      // Re-anchor the ad's end time whenever the countdown changes.
      if (timerText !== lastTimerText) {
        lastTimerText = timerText;
        const rem = parseRemaining(timerText);
        if (rem !== null) adEnd = { video, time: video.currentTime + rem };
      }

      if (typeof breakSkip === "string") {
        const left = adEnd && adEnd.video === video ? adEnd.time - video.currentTime : Infinity;
        if (left > endMargin()) speedUp(video);
        else slowDown(video, true); // land softly: last ~2s of the ad at 1x, still muted
      }
    } else if (breakActive) {
      // --- Countdown gone: stop fast-forwarding right away, but keep break state briefly ---
      slowDown(video, false);
      restoreAudio(video);
      if (adGoneAt === null) adGoneAt = performance.now();
      else if (performance.now() - adGoneAt > GRACE_MS) endBreak(video);
    } else if (ffActive) {
      slowDown(video, false);
    }
  }

  // Self-scheduling loop: fast while fast-forwarding, slower otherwise.
  (function loop() {
    try { tick(); } catch (e) { console.warn("[PrimeAdFF]", e); }
    setTimeout(loop, ffActive || manualFF ? TICK_FF_MS : TICK_IDLE_MS);
  })();

  // React immediately when the player UI changes (e.g. countdown disappears).
  let pending = false;
  new MutationObserver(() => {
    if (!breakActive && !ffActive) return; // only needed during ads
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      try { tick(); } catch (e) { console.warn("[PrimeAdFF]", e); }
    });
  }).observe(document.documentElement, {
    childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: ["class", "style"]
  });

  // Prime sometimes resets playbackRate; re-apply while we're boosting.
  document.addEventListener("ratechange", (e) => {
    if (ffActive && e.target.tagName === "VIDEO" && e.target.playbackRate !== settings.speed) {
      e.target.playbackRate = settings.speed;
    }
  }, true);

  // Hotkey: Alt/Option + S
  window.addEventListener("keydown", (e) => {
    if (!e.altKey || e.code !== settings.hotkey) return;
    e.preventDefault();
    e.stopPropagation();
    const video = getVideo();
    if (getAdIndicatorText() !== null || breakActive) {
      if (typeof breakSkip === "string") {
        breakSkip = false; // cancelled: don't let keywords re-trigger this break
        slowDown(video, false);
        restoreAudio(video);
        toast("▶ Fast-forward cancelled for this break");
      } else {
        breakSkip = "hotkey";
        toast("⏩ Fast-forwarding ad (hotkey)");
        tick();
      }
    } else {
      // Fallback if ad detection fails (e.g., Prime changed its markup).
      manualFF = !manualFF;
      if (manualFF) toast("⏩ No ad detected — manual fast-forward. Press Alt+S again to stop.");
      else { slowDown(video, false); restoreAudio(video); toast("▶ Normal playback"); }
    }
  }, true);

  // Small on-screen notice that works in fullscreen.
  let toastEl, toastTimer;
  function toast(msg) {
    const host = document.fullscreenElement || document.body;
    if (!toastEl) {
      toastEl = document.createElement("div");
      Object.assign(toastEl.style, {
        position: "fixed", top: "24px", left: "50%", transform: "translateX(-50%)",
        background: "rgba(0,0,0,0.8)", color: "#fff", padding: "10px 16px",
        borderRadius: "8px", font: "600 15px system-ui, sans-serif",
        zIndex: 2147483647, pointerEvents: "none", transition: "opacity .3s"
      });
    }
    if (toastEl.parentNode !== host) host.appendChild(toastEl);
    toastEl.textContent = msg;
    toastEl.style.opacity = "1";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.style.opacity = "0"; }, 2500);
  }
})();
