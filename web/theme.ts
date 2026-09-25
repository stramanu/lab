/**
 * Light/dark theme shared by every page of the lab, remembered in local storage. Each page's <head>
 * applies the stored choice before the first paint (an inline script with the same key); this module
 * wires the toggle button. Without a stored choice, the lab is dark.
 */
export const THEME_KEY = 'lab-theme';

/** Wires the page's theme button; `onChange` redraws what is painted from CSS colours (canvas charts). */
export function initTheme(onChange: () => void = () => {}): void {
  const root = document.documentElement;
  document.getElementById('theme')!.addEventListener('click', () => {
    const next = root.dataset.theme === 'light' ? 'dark' : 'light';
    root.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* storage unavailable: the choice lasts for this page only */
    }
    onChange();
  });
}
