/**
 * "Network ⇄": moves a page's network view next to its live animation, so the forward pass can be watched
 * together with what it drives. The page's grid places the panels (a `data-split` attribute on the
 * layout switches its areas); the choice is shared by every page of the lab and remembered.
 */
const SPLIT_KEY = 'lab-network-split';

export function initNetworkSplit(layout: HTMLElement, button: HTMLButtonElement): void {
  const apply = (on: boolean) => {
    layout.dataset.split = String(on);
    button.setAttribute('aria-pressed', String(on));
    button.title = on ? 'Put the network view back below' : 'Show the network view next to the animation';
  };
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(SPLIT_KEY);
  } catch {
    /* storage unavailable: off by default */
  }
  apply(stored === 'true');
  button.addEventListener('click', () => {
    const on = layout.dataset.split !== 'true';
    apply(on);
    try {
      localStorage.setItem(SPLIT_KEY, String(on));
    } catch {
      /* the choice lasts for this page only */
    }
  });
}
