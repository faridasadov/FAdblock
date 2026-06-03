export function t(key, substitutions) {
  return chrome.i18n.getMessage(key, substitutions) || key;
}

export function applyI18n(root = document) {
  const locale = (chrome.i18n.getUILanguage?.() || 'en').split('-')[0];
  root.documentElement.lang = locale;

  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });

  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.setAttribute('placeholder', t(el.dataset.i18nPlaceholder));
  });

  root.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel));
  });
}
