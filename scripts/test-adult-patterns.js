const patterns = [
  '^https?://[^/?#]+\\.xxx([/?#]|$)',
  '^https?://[^/?#]+\\.adult([/?#]|$)',
  '^https?://[^/?#]+\\.porn([/?#]|$)',
  '^https?://[^/?#]*porno',
  '^https?://[^/?#]*trah',
  '^https?://[^/?#]*trach',
  '^https?://[^/?#]*erotik',
  '^https?://[^/?#]*seks[^ei]',
  '^https?://(www\\.)?sex',
  '^https?://[^/?#]*\\.sex\\.',
  '^https?://(www\\.)?xxx',
  '^https?://([^./?#:]+\\.)?pornhub\\.[^./?#:]+([:/?#]|$)',
  '^https?://([^./?#:]+\\.)?xhamster\\.[^./?#:]+([:/?#]|$)',
  '^https?://([^./?#:]+\\.)?xnxx\\.[^./?#:]+([:/?#]|$)',
  '^https?://([^./?#:]+\\.)?xvideos\\.[^./?#:]+([:/?#]|$)',
  '^https?://[^/?#]*hentai[^/?#]*',
  '^https?://[^/?#]*onlyfans[^/?#]*',
  '^https?://[^/?#]*erotic[^/?#]*',
];

const tests = [
  // Should BLOCK
  ['https://xha.vtrahe.work/categories/', true, 'trah in vtrahe'],
  ['https://trah.tv/', true, 'trah domain'],
  ['https://trachtube.com/', true, 'trach'],
  ['https://trahnuli.com/', true, 'trahn'],
  ['https://seks.ru/', true, 'seks.'],
  ['https://seks-video.ru/watch', true, 'seks-'],
  ['https://seksfilmi.ru/', true, 'seksfilmi — should block'],
  ['https://bysex.net/', true, 'bysex — "sex" at end of label'],
  ['https://vps402.strip2.co/', false, 'strip2.co — in domain list, not keyword pattern'],
  ['https://erotika.ru/', true, 'erotika — CIS spelling via erotik pattern'],
  ['https://trachtube.com/', true, 'trachtube — via trach pattern'],
  ['https://pornhub.com/', true, 'pornhub'],
  ['https://xhamster.com/', true, 'xhamster'],
  ['https://rule34.xxx/', true, '.xxx TLD'],
  ['https://erotika.ru/', true, 'erotic*'],
  // Should NOT block
  ['https://stackoverflow.com/', false, 'legit'],
  ['https://seksi.id/', false, 'seksi (Indonesian) - has letter i after seks'],
  ['https://example.com/categories', false, 'legit path'],
  ['https://analytics.google.com/', false, 'analytics'],
  ['https://canalsatplus.es/', false, 'canal'],
];

let pass = 0, fail = 0;
for (const [url, shouldBlock, note] of tests) {
  const blocked = patterns.some(p => new RegExp(p, 'i').test(url));
  const ok = blocked === shouldBlock;
  if (ok) pass++; else fail++;
  console.log((ok ? '✓' : '✗') + ' [' + (blocked ? 'BLOCK' : 'allow') + '] ' + url + ' (' + note + ')');
}
console.log('\n' + pass + ' pass, ' + fail + ' fail');
