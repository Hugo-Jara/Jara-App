// Netlify (plan gratis) inyecta un iframe flotante "Powered by Netlify"
// (#nl-badge-frame, y a veces #nl-hud-frame) que tapa el menú de abajo.
// El CSS lo esconde; esto además lo saca si aparece después de cargar.
const IDS = ['nl-badge-frame', 'nl-hud-frame', 'nl-badge'];

function sacar() {
  for (const id of IDS) document.getElementById(id)?.remove();
}

export function sinBotonNetlify() {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
  sacar();
  new MutationObserver(sacar).observe(document.documentElement, { childList: true, subtree: true });
}
