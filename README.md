# FAdblock

Chrome və Firefox üçün açıq mənbəli, yüngül reklam bloker.

![Version](https://img.shields.io/badge/version-1.0.6-red)
![Manifest](https://img.shields.io/badge/Manifest-V3-blue)
![Chrome](https://img.shields.io/badge/Chrome-✓-green)
![Firefox](https://img.shields.io/badge/Firefox%20128+-✓-orange)
![Tests](https://img.shields.io/badge/tests-24%2F24-brightgreen)

---

## Xüsusiyyətlər

- **Şəbəkə bloku** — `declarativeNetRequest` ilə 92 reklam domenini bloklar (Google Ads, Taboola, Criteo, Facebook Pixel və s.)
- **Kosmetik filtrlər** — `.adsbygoogle`, `#taboola`, `.advertisement` və digər reklam elementlərini CSS ilə gizlədir
- **YouTube reklamları** — "Skip" düyməsini avtomatik basır, atlana bilməyən reklamları sürətlə keçir
- **Global on/off** — Bütün bloklamanı bir kliklə söndür/aç
- **Sayt-xüsusi toggle** — İstənilən domenə aid bloklamanı söndür
- **Badge sayacı** — Hər səhifədə neçə reklam bloklandığını göstərir
- **Statistika** — Bu gün və cəmi bloklanmış reklam sayı
- **Whitelist** — İcazə verilən saytlar siyahısı

---

## Quraşdırma

### Chrome

1. Bu repo-nu klon et və ya ZIP yüklə
2. `npm install && npm run generate` əmrini işlət
3. Chrome-da `chrome://extensions/` aç
4. **Developer mode** düyməsini aktiv et
5. **Load unpacked** → layihə qovluğunu seç

### Firefox

1. Firefox-da `about:debugging#/runtime/this-firefox` aç
2. **Load Temporary Add-on…** → `manifest.json` faylını seç

> Daimi quraşdırma üçün Firefox Add-ons mağazasında nəşr tələb olunur.

---

## Skriptlər

```bash
npm install               # asılılıqları yüklə
npm run generate:rules    # rules/rules.json yenilə
npm run generate:icons    # PNG ikonları yenidən yarat
npm run generate          # ikisini birlikdə çalışdır
npm run pack:chrome       # dist/fadblock-chrome.zip
npm run pack:firefox      # dist/fadblock-firefox.zip
```

**Test:**
```bash
xvfb-run node scripts/test-extension.js all     # Chrome + Firefox
xvfb-run node scripts/test-extension.js chrome  # yalnız Chrome
node scripts/test-extension.js firefox          # yalnız Firefox
```

---

## Struktur

```
FAdblock/
├── manifest.json              # MV3 manifesti
├── background/
│   └── service-worker.js      # statistika, whitelist, global toggle
├── content/
│   └── content.js             # kosmetik CSS, YouTube ad-skip
├── popup/
│   ├── popup.html / .css / .js
├── options/
│   ├── options.html / .css / .js
├── rules/
│   └── rules.json             # 92 declarativeNetRequest qaydası
├── icons/
│   └── icon16/32/48/128.png
└── scripts/
    ├── generate-rules.js      # domain siyahısından rules.json yarat
    ├── generate-icons.js      # canvas ilə PNG ikonlar yarat
    └── test-extension.js      # Playwright test suite (24/24)
```

---

## Texniki detallar

| Komponent | Texnologiya |
|-----------|-------------|
| Şəbəkə bloklama | `declarativeNetRequest` (MV3) |
| Statistika sayacı | `chrome.webRequest.onBeforeRequest` (production-ready) |
| Kosmetik filtrlər | Content script, CSS inject |
| YouTube skip | `setInterval` + skip button click + `playbackRate = 16` |
| Global pause | `updateEnabledRulesets` + `chrome.storage` |
| Firefox uyğunluğu | `background.scripts` fallback, `strict_min_version: 128` |

---

## ♥ Dəstəklə

Bu layihə faydalı idisə, bir qəhvə al:

**[PayPal ilə dəstəklə](https://www.paypal.com/donate/?hosted_button_id=Z79A28XHU8L7S)**

---

## Müəllif

**Farid Asadov** — [github.com/faridasadov](https://github.com/faridasadov)

## Lisenziya

MIT
