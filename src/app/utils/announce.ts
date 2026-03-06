/**
 * Announce a message to screen readers via the live region injected by Router.tsx.
 * Clears then re-sets the text so repeated identical messages are still announced.
 */
export function announce(msg: string) {
  const el = document.getElementById('sable-announcements');
  if (!el) return;
  el.textContent = '';
  requestAnimationFrame(() => {
    el.textContent = msg;
  });
}
