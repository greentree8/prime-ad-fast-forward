const DEFAULTS = { enabled: true, mode: "keywords", keywords: [], speed: 16, mute: true, hotkey: "KeyS" };
const $ = (id) => document.getElementById(id);

chrome.storage.sync.get(DEFAULTS, (s) => {
  $("enabled").checked = s.enabled;
  $("mute").checked = s.mute;
  $("speed").value = String(s.speed);
  $("keywords").value = s.keywords.join("\n");
  document.querySelector(`input[name=mode][value=${s.mode}]`).checked = true;
});

function save() {
  chrome.storage.sync.set({
    enabled: $("enabled").checked,
    mute: $("mute").checked,
    speed: Number($("speed").value),
    mode: document.querySelector("input[name=mode]:checked").value,
    keywords: $("keywords").value.split("\n").map(k => k.trim().toLowerCase()).filter(Boolean)
  }, () => {
    $("status").textContent = "Saved";
    setTimeout(() => ($("status").textContent = ""), 1000);
  });
}

document.querySelectorAll("input, select").forEach(el => el.addEventListener("change", save));
let t;
$("keywords").addEventListener("input", () => { clearTimeout(t); t = setTimeout(save, 400); });
