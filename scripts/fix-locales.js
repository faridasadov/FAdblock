#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

const localesDir = path.resolve(__dirname, '../_locales');

const safeSearch = {
  az:    { label: 'SafeSearch (Google · Bing · Yandex · DDG)', hint: '18+ filtri aktiv olduqda axtarış nəticələrindən yetkin məzmun gizlədilir', badge: '18+ filtri ilə aktivdir' },
  en:    { label: 'SafeSearch (Google · Bing · Yandex · DDG)', hint: 'Hides adult content from search results when the adult filter is enabled', badge: 'Active with adult filter' },
  ru:    { label: 'SafeSearch (Google · Bing · Yandex · DDG)', hint: 'Скрывает контент для взрослых из результатов поиска при активном фильтре', badge: 'Активно с фильтром 18+' },
  tr:    { label: 'SafeSearch (Google · Bing · Yandex · DDG)', hint: 'Yetişkin filtresi etkinken arama sonuçlarından yetişkin içerikleri gizler', badge: 'Yetişkin filtresiyle aktif' },
  de:    { label: 'SafeSearch (Google · Bing · Yandex · DDG)', hint: 'Verbirgt Erwachseneninhalte aus Suchergebnissen bei aktivem Filter', badge: 'Mit Erwachsenenfilter aktiv' },
  es:    { label: 'SafeSearch (Google · Bing · Yandex · DDG)', hint: 'Oculta contenido adulto de los resultados de búsqueda con el filtro activo', badge: 'Activo con filtro adulto' },
  fr:    { label: 'SafeSearch (Google · Bing · Yandex · DDG)', hint: 'Masque le contenu adulte des résultats de recherche lorsque le filtre est actif', badge: 'Actif avec filtre adulte' },
  it:    { label: 'SafeSearch (Google · Bing · Yandex · DDG)', hint: 'Nasconde contenuti adulti dai risultati quando il filtro è attivo', badge: 'Attivo con filtro adulti' },
  pt_BR: { label: 'SafeSearch (Google · Bing · Yandex · DDG)', hint: 'Oculta conteúdo adulto dos resultados quando o filtro adulto está ativo', badge: 'Ativo com filtro adulto' },
  uk:    { label: 'SafeSearch (Google · Bing · Yandex · DDG)', hint: 'Приховує контент для дорослих із результатів пошуку при активному фільтрі', badge: 'Активно з фільтром 18+' },
};

const descFix = {
  ru: 'Быстрый блокировщик рекламы для Firefox. Пропускает рекламу YouTube, блокирует трекеры и контент для взрослых.',
  tr: 'Firefox için hızlı reklam engelleyici. YouTube reklamlarını atlar, izleyicileri ve yetişkin içeriklerini engeller.',
  de: 'Schneller Werbeblocker für Firefox. Überspringt YouTube-Werbung, blockiert Tracker und Erwachseneninhalte.',
  es: 'Bloqueador de anuncios rápido para Firefox. Omite anuncios de YouTube, bloquea rastreadores y contenido adulto.',
  fr: 'Bloqueur de publicités rapide pour Firefox. Ignore les pubs YouTube, bloque les traqueurs et contenus adultes.',
  it: 'Blocca pubblicità per Firefox. Salta le pub di YouTube, blocca tracker e contenuti per adulti.',
  pt_BR: 'Bloqueador de anúncios para Firefox. Pula anúncios do YouTube, bloqueia rastreadores e conteúdo adulto.',
  uk: 'Блокувальник реклами для Firefox. Пропускає рекламу YouTube, блокує трекери та контент для дорослих.',
};

for (const dir of fs.readdirSync(localesDir)) {
  const file = path.join(localesDir, dir, 'messages.json');
  if (!fs.existsSync(file)) continue;
  const msgs = JSON.parse(fs.readFileSync(file, 'utf8'));
  let changed = false;

  if (msgs.extDescription && msgs.extDescription.message.includes('for Chrome')) {
    msgs.extDescription.message = descFix[dir] || msgs.extDescription.message.replace('for Chrome', 'for Firefox');
    changed = true;
  }

  if (msgs.optionsAdultTitle && msgs.optionsAdultTitle.message.startsWith('🔞 ')) {
    msgs.optionsAdultTitle.message = msgs.optionsAdultTitle.message.slice(2);
    changed = true;
  }

  if (!msgs.optionsSafeSearchLabel) {
    const ss = safeSearch[dir] || safeSearch.en;
    msgs.optionsSafeSearchLabel = { message: ss.label };
    msgs.optionsSafeSearchHint  = { message: ss.hint };
    msgs.optionsSafeSearchBadge = { message: ss.badge };
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(file, JSON.stringify(msgs, null, 2) + '\n');
    console.log('Fixed:', dir);
  } else {
    console.log('OK:   ', dir);
  }
}
