/**
 * Light/dark theme shared by every page of the lab, remembered in local storage. Each page's <head>
 * applies the stored choice before the first paint (an inline script with the same key); this module
 * wires the toggle button. Without storage, the page follows the system theme.
 */
export const THEME_KEY = 'lab-theme';

/** Wires the page's theme button; `onChange` redraws what is painted from CSS colours (canvas charts). */
export function initTheme(onChange: () => void = () => {}): void {
  const root = document.documentElement;
  document.getElementById('theme')!.addEventListener('click', () => {
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    const next = dark ? 'light' : 'dark';
    root.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* storage unavailable: the choice lasts for this page only */
    }
    onChange();
  });
}
