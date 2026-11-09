// Tramos con rangos UTF-16; compatibles con textos antiguos sin formato.
export function dividirFormato(texto = '', formatos = []) {
  const eventos = new Map([[0, []], [texto.length, []]]);
  for (const f of formatos) {
    if (!eventos.has(f.inicio)) eventos.set(f.inicio, []);
    if (!eventos.has(f.fin)) eventos.set(f.fin, []);
    eventos.get(f.inicio).push({ f, cambio: 1 }); eventos.get(f.fin).push({ f, cambio: -1 });
  }
  const limites = [...eventos.keys()].sort((a, b) => a - b);
  const activo = { negrita: 0, cursiva: 0, subrayado: 0 }, tramos = [];
  limites.slice(0, -1).forEach((inicio, i) => {
    for (const { f, cambio } of eventos.get(inicio)) for (const clave of Object.keys(activo)) if (f[clave]) activo[clave] += cambio;
    const fin = limites[i + 1];
    if (fin > inicio) tramos.push({ inicio, fin, texto: texto.slice(inicio, fin), negrita: activo.negrita > 0, cursiva: activo.cursiva > 0, subrayado: activo.subrayado > 0 });
  });
  return tramos;
}
export function extraerTexto(elemento) {
  let texto = ''; const formatos = [];
  const caminar = (nodo, estilo = {}) => {
    if (nodo.nodeType === 3) {
      const inicio = texto.length; texto += nodo.nodeValue || '';
      if (texto.length > inicio && (estilo.negrita || estilo.cursiva || estilo.subrayado)) formatos.push({ inicio, fin: texto.length, ...estilo });
      return;
    }
    if (nodo.nodeType !== 1) return;
    const nombre = nodo.tagName.toLowerCase();
    if (nombre === 'br') { texto += '\n'; return; }
    if ((nombre === 'div' || nombre === 'p') && texto && !texto.endsWith('\n')) texto += '\n';
    const siguiente = { ...estilo };
    if (nombre === 'b' || nombre === 'strong' || nodo.style?.fontWeight === 'bold') siguiente.negrita = true;
    if (nombre === 'i' || nombre === 'em' || nodo.style?.fontStyle === 'italic') siguiente.cursiva = true;
    if (nombre === 'u' || nodo.style?.textDecorationLine?.includes('underline')) siguiente.subrayado = true;
    for (const hijo of nodo.childNodes) caminar(hijo, siguiente);
  };
  for (const hijo of elemento.childNodes) caminar(hijo);
  return { texto, formatos };
}
