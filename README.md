# FAdblock

Chrome və Firefox üçün açıq mənbəli, yüngül reklam bloker.

![Version](https://img.shields.io/badge/version-1.0.26-red)
![Manifest](https://img.shields.io/badge/Manifest-V3-blue)
![Chrome](https://img.shields.io/badge/Chrome-✓-green)
![Firefox](https://img.shields.io/badge/Firefox%20128+-✓-orange)
![Tests](https://img.shields.io/badge/tests-24%2F24-brightgreen)

---

## Yüklə

| Brauzer | Mağaza |
|---------|--------|
| Chrome | [![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Tezliklə-lightgrey)](https://chrome.google.com/webstore) |
| Firefox | [![Firefox Add-ons](https://img.shields.io/badge/Firefox%20Add--ons%20(AMO)-Tezliklə-lightgrey)](https://addons.mozilla.org) |

> Store linkləri yayımlandıqdan sonra yenilənəcək.

---

## Xüsusiyyətlər

- **Şəbəkə bloku** — `declarativeNetRequest` + həftəlik yenilənən ~3500 domenlik filter siyahısı
- **Kosmetik filtrlər** — `.adsbygoogle`, `#taboola`, `.advertisement` və digər reklam elementlərini CSS ilə gizlədir
- **Element seçici** — İstənilən elementə klikləyib onu daima gizlət (popup-dan ⊙ düyməsi)
- **Xüsusi CSS filtrlər** — Öz CSS selectorlarını əlavə et, bütün səhifələrdə tətbiq olunur
- **YouTube reklamları** — Skip düyməsini avtomatik basır, atlana bilməyən reklamları sürətlə keçir
- **Global on/off** — `Alt+Shift+A` qısayolu və ya popup toggle ilə
- **Sayt-xüsusi toggle** — İstənilən domenə aid bloklamanı söndür / whitelist
- **Badge sayacı** — Hər səhifədə neçə reklam bloklandığını göstərir
- **Statistika** — Bu gün, cəmi, sayt üzrə top 10, 7-günlük bar qrafiki
- **Kontekst menyusu** — Sağ klik → "Bu elementi blokla" / "Bu domeini blokla"
- **Fingerprint qoruma** — Canvas noise, AudioContext noise, WebRTC IP sızması qoruması
- **Milestone bildirişlər** — 100, 500, 1k, 5k... reklam bloklandıqda Chrome bildirişi
- **Import / Export** — Bütün ayarları JSON kimi ixrac / idxal et
- **PayPal donate** — Layihəni dəstəklə

---

## Quraşdırma (developer mode)

### Chrome

1. Bu repo-nu klon et: `git clone https://github.com/faridasadov/FAdblock.git`
2. `npm install && npm run generate`
3. `chrome://extensions/` → **Developer mode** → **Load unpacked** → qovluğu seç

### Firefox

1. `about:debugging#/runtime/this-firefox` aç
2. **Load Temporary Add-on…** → `manifest.json` seç

---

## Skriptlər

```bash
npm install                  # asılılıqları yüklə (hook-u da qurur)
npm run generate:rules       # rules/rules.json yenilə
npm run generate:icons       # PNG ikonları yenidən yarat
npm run pack:chrome          # dist/fadblock-chrome.zip
npm run pack:firefox         # web-ext ilə dist qovluğuna Firefox artifact yaradır
```

**Test:**
```bash
xvfb-run node scripts/test-extension.js all     # Chrome + Firefox (24/24)
xvfb-run node scripts/test-extension.js chrome  # yalnız Chrome
node scripts/test-extension.js firefox          # yalnız Firefox
```

> `npm install` sonrası git pre-commit hook avtomatik qurulur — hər commit-də versiya patch artır.

---

## Struktur

```
FAdblock/
├── manifest.json                  # MV3 manifesti (Chrome + Firefox)
├── background/
│   └── service-worker.js          # statistika, whitelist, filter yeniləmə, DNR
├── content/
│   ├── content.js                 # kosmetik CSS, YouTube ad-skip, custom selectors
│   ├── fingerprint.js             # canvas/audio/WebRTC fingerprint qoruması
│   └── picker.js                  # element seçici (hover + click + confirm)
├── popup/
│   ├── popup.html / .css / .js    # badge, toggle, element seç, donate
├── options/
│   ├── options.html / .css / .js  # stats, whitelist, per-site, CSS, blocked, chart, i/o
├── rules/
│   └── rules.json                 # 92 statik declarativeNetRequest qaydası
├── icons/
│   └── icon16/32/48/128.png
└── scripts/
    ├── generate-rules.js          # domain siyahısından rules.json yarat
    ├── generate-icons.js          # canvas ilə PNG ikonlar yarat
    ├── test-extension.js          # Playwright test suite (24/24)
    └── hooks/pre-commit           # versiya auto-bump hook
```

---

## Texniki detallar

| Komponent | Texnologiya |
|-----------|-------------|
| Şəbəkə bloklama | `declarativeNetRequest` — 92 statik + ~3500 dinamik qayda |
| Filter yeniləmə | `chrome.alarms` həftəlik, pgl.yoyo.org mənbəyi |
| Statistika | `webRequest.onBeforeRequest` (production, dev mode lazım deyil) |
| Kosmetik filtrlər | Content script, `document_start`, `MutationObserver` |
| Element seçici | Hover highlight → CSS selector generate → `custom_selectors` storage |
| YouTube skip | `setInterval(300ms)` + `yt-navigate-finish` event |
| Fingerprint | Canvas `getImageData` noise, AudioContext noise, WebRTC relay-only |
| Global pause | `updateEnabledRulesets` + `chrome.storage` real-time sync |
| Firefox uyğunluğu | `background.scripts` fallback, `strict_min_version: 128.0` |
| Versiya idarəsi | Git pre-commit hook — hər commit-də patch avtomatik artır |

---

## ♥ Dəstəklə

Bu layihə faydalı idisə, bir qəhvə al:

**[PayPal ilə dəstəklə](https://www.paypal.com/donate/?hosted_button_id=Z79A28XHU8L7S)**

---

## Müəllif

**Farid Asadov** — [github.com/faridasadov](https://github.com/faridasadov)

## Lisenziya

MIT
