// Lab home: only the theme toggle (the rest of the page is static).
const root = document.documentElement;
document.getElementById('theme')!.addEventListener('click', () => {
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
});
