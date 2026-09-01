const THEME_KEY = 'ui_theme';

export const THEMES = [
  { id: 'light',    icon: '☀️',  label: 'Light' },
  { id: 'dark',     icon: '🌙',  label: 'Dark' },
  { id: 'midnight', icon: '🌚',  label: 'Midnight' },
  { id: 'system',   icon: '💻',  label: 'System' },
];

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'system') {
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    root.setAttribute('data-theme-system', 'true');
  } else {
    root.setAttribute('data-theme', theme);
    root.removeAttribute('data-theme-system');
  }
}

export async function loadAndApplyTheme() {
  const { ui_theme } = await chrome.storage.local.get(THEME_KEY);
  const theme = ui_theme || 'system';
  applyTheme(theme);
  if (theme === 'system') {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme('system'));
  }
  return theme;
}

export async function saveTheme(theme) {
  await chrome.storage.local.set({ [THEME_KEY]: theme });
  applyTheme(theme);
}
