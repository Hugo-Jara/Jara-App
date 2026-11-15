// Convierte privacidad/privacidad.md en una página HTML suelta, pública y sin
// la app (Google la pide así para el ingreso con Google). Solo entiende lo que
// usa ese archivo: # título, ## secciones, listas con "- ", **negrita** y correos.
import { readFileSync } from 'node:fs';

const escapar = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const enLinea = (t) => escapar(t)
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/([\w.+-]+@[\w-]+\.[\w.]+[a-z])/gi, '<a href="mailto:$1">$1</a>');

export function paginaPrivacidad(md, base = '/') {
  const lineas = md.replace(/\r/g, '').split('\n');
  const html = [];
  let titulo = 'Política de privacidad';
  let enLista = false;
  let parrafo = [];
  const cerrarParrafo = () => { if (parrafo.length) { html.push(`<p>${enLinea(parrafo.join(' '))}</p>`); parrafo = []; } };
  const cerrarLista = () => { if (enLista) { html.push('</ul>'); enLista = false; } };
  for (const l of lineas) {
    if (/^# /.test(l)) { cerrarParrafo(); cerrarLista(); titulo = l.slice(2).trim(); html.push(`<h1>${enLinea(titulo)}</h1>`); }
    else if (/^## /.test(l)) { cerrarParrafo(); cerrarLista(); html.push(`<h2>${enLinea(l.slice(3).trim())}</h2>`); }
    else if (/^- /.test(l)) { cerrarParrafo(); if (!enLista) { html.push('<ul>'); enLista = true; } html.push(`<li>${enLinea(l.slice(2).trim())}</li>`); }
    else if (!l.trim()) { cerrarParrafo(); cerrarLista(); }
    else { cerrarLista(); parrafo.push(l.trim()); }
  }
  cerrarParrafo(); cerrarLista();
  // La línea que sigue al título (vigencia) va como subtítulo.
  const i = html.findIndex((h) => h.startsWith('<h1>'));
  if (i >= 0 && html[i + 1]?.startsWith('<p>')) html[i + 1] = html[i + 1].replace('<p>', '<p class="vigencia">');

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="theme-color" content="#120E0D" />
<title>${escapar(titulo)} · Club Deportivo Hugo Jara</title>
<link rel="icon" type="image/png" href="${base}icon-192.png" />
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #120E0D; color: #EDE6DC; font: 16px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 680px; margin: 0 auto; padding: 32px 16px 48px; }
  .escudo { display: block; width: 72px; height: 72px; object-fit: contain; margin: 0 auto 12px; mix-blend-mode: lighten; }
  h1 { text-align: center; font-size: 1.6rem; margin: 0 0 4px; }
  .vigencia { text-align: center; color: #A89C8E; font-size: .9rem; margin-top: 0; }
  h2 { color: #E0A93B; font-size: 1.1rem; margin: 2rem 0 .5rem; }
  ul { padding-left: 1.2rem; }
  li { margin: .3rem 0; }
  a { color: #F0564A; }
  .volver { display: inline-block; margin-top: 2rem; }
</style>
</head>
<body>
<main>
<img class="escudo" src="${base}escudo.jpg" alt="Escudo del Club Deportivo Hugo Jara" />
${html.join('\n')}
<a class="volver" href="${base}">← Ir a Jara App</a>
</main>
</body>
</html>
`;
}

// Plugin de Vite: agrega privacidad.html al build.
export function privacidadPlugin() {
  let base = '/';
  return {
    name: 'jara-privacidad',
    configResolved(c) { base = c.base; },
    generateBundle() {
      const md = readFileSync(new URL('../privacidad/privacidad.md', import.meta.url), 'utf8');
      this.emitFile({ type: 'asset', fileName: 'privacidad.html', source: paginaPrivacidad(md, base) });
    },
  };
}
