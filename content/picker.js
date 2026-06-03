(function () {
  'use strict';

  const HIGHLIGHT = '__fb_pick__';
  const t = (key, substitutions) => chrome.i18n.getMessage(key, substitutions) || key;
  let active = false;
  let lastEl = null;

  const style = document.createElement('style');
  style.textContent = `
    .__fb_pick__ { outline: 2px solid #e74c3c !important; outline-offset: 1px; cursor: crosshair !important; background-color: rgba(231,76,60,.08) !important; }
    #__fb_bar__ { position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#e74c3c;color:#fff;font:13px/36px 'Segoe UI',sans-serif;padding:0 16px;text-align:center;pointer-events:none; }
  `;

  let bar = null;

  function activate() {
    if (active) return;
    active = true;
    document.documentElement.appendChild(style);
    bar = document.createElement('div');
    bar.id = '__fb_bar__';
    bar.textContent = t('pickerBarText');
    document.documentElement.appendChild(bar);
    document.addEventListener('mouseover', onOver, true);
    document.addEventListener('mouseout',  onOut,  true);
    document.addEventListener('click',     onClick, true);
    document.addEventListener('keydown',   onKey,  true);
  }

  function deactivate() {
    if (!active) return;
    active = false;
    style.remove();
    bar?.remove(); bar = null;
    lastEl?.classList.remove(HIGHLIGHT); lastEl = null;
    document.removeEventListener('mouseover', onOver, true);
    document.removeEventListener('mouseout',  onOut,  true);
    document.removeEventListener('click',     onClick, true);
    document.removeEventListener('keydown',   onKey,  true);
  }

  function onOver(e) {
    if (e.target.id === '__fb_bar__') return;
    lastEl?.classList.remove(HIGHLIGHT);
    lastEl = e.target;
    lastEl.classList.add(HIGHLIGHT);
  }

  function onOut(e) { e.target.classList.remove(HIGHLIGHT); }

  function onKey(e) { if (e.key === 'Escape') deactivate(); }

  function onClick(e) {
    if (e.target.id === '__fb_bar__') return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.target;
    const selector = buildSelector(el);
    deactivate();

    // Preview: hide element temporarily while user confirms
    const preview = document.createElement('style');
    preview.textContent = `${selector}{display:none!important}`;
    document.head.appendChild(preview);

    if (window.confirm(t('pickerConfirm', [selector]))) {
      chrome.storage.local.get('custom_selectors', ({ custom_selectors }) => {
        const list = custom_selectors || [];
        if (!list.includes(selector)) {
          chrome.storage.local.set({ custom_selectors: [...list, selector] });
        }
      });
    } else {
      preview.remove();
    }
  }

  function buildSelector(el) {
    if (el.id) return '#' + CSS.escape(el.id);

    let tag = el.tagName.toLowerCase();
    const cls = Array.from(el.classList)
      .filter(c => !c.startsWith('__fb'))
      .slice(0, 2)
      .map(CSS.escape);
    let sel = cls.length ? `${tag}.${cls.join('.')}` : tag;

    if (document.querySelectorAll(sel).length === 1) return sel;

    const parent = el.parentElement;
    if (parent && parent.tagName !== 'HTML' && parent.tagName !== 'BODY') {
      const idx = Array.from(parent.children).indexOf(el) + 1;
      const parentSel = buildSelector(parent);
      return `${parentSel} > ${sel}:nth-child(${idx})`;
    }
    return sel;
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'ACTIVATE_PICKER') activate();
  });
})();
