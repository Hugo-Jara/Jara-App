// La misma composición en canvas alimenta la vista previa, el lector y los PNG.
export const ANCHO = 1280;
export const ALTO = 1600;
const INICIO = 270, FIN = 1460, MARGEN = 46;
const cargar = async src => { const i = new Image(); i.src = src; await i.decode(); return i; };
export async function componerEdicion(e) {
  const recursos = new Map();
  const escudo = await cargar(`${import.meta.env.BASE_URL}escudo.jpg`);
  for (const b of e.bloques) for (const n of b.notas) for (const f of n.fotos) if (f.src && !recursos.has(f.src)) recursos.set(f.src, await cargar(f.src));
  const medida = document.createElement('canvas').getContext('2d');
  const paginas = [[]];
  function poner(p, op) { if (p > 39) throw new Error('La edición supera 40 páginas. Divide el contenido en varias ediciones.'); while (paginas.length <= p) paginas.push([]); paginas[p].push(op); }
  function lineas(texto, ancho, fuente) {
    medida.font = fuente;
    const resultado = []; let linea = '';
    for (const palabra of texto.trim().split(/\s+/).filter(Boolean)) {
      if (medida.measureText(palabra).width > ancho) throw new Error('Hay una palabra o enlace demasiado largo para la columna. Acórtalo antes de exportar.');
      const prueba = linea ? `${linea} ${palabra}` : palabra;
      if (medida.measureText(prueba).width > ancho && linea) { resultado.push(linea); linea = palabra; } else linea = prueba;
    }
    if (linea) resultado.push(linea);
    return resultado;
  }
  function texto(p, x, y, ls, fuente, salto, color = '#17130f') { ls.forEach((s, i) => poner(p, { tipo: 'texto', x, y: y + i * salto, texto: s, fuente, color })); }
  function articulo(n, tipo, posicion, x, ancho) {
    let { p, y } = posicion;
    const fuente = tipo === 'principal' ? 'bold 55px Georgia' : 'bold 39px Georgia';
    const salto = tipo === 'principal' ? 60 : 45;
    const titulo = lineas(n.titulo || 'Noticia sin título', ancho, fuente);
    const altoTitulo = titulo.length * salto + 32;
    if (altoTitulo > FIN - INICIO - 50) throw new Error('Un titular ocupa demasiado espacio. Acórtalo antes de exportar.');
    const cabecera = continuacion => {
      if (continuacion) { texto(p, x, y, ['CONTINUACIÓN'], 'bold 19px Arial', 24, '#a92520'); y += 28; }
      if (tipo === 'destacada') { poner(p, { tipo: 'rect', x: x - 8, y: y - 8, ancho: ancho + 16, alto: altoTitulo + 8, color: '#ebd9bc' }); }
      texto(p, x, y, titulo, fuente, salto); y += altoTitulo;
    };
    if (y + altoTitulo + 60 > FIN) { p++; y = INICIO; }
    cabecera(false);
    const inicioTexto = y;
    const siguiente = () => { texto(p, x, FIN + 4, ['Sigue en la página ' + (p + 2)], 'italic 18px Georgia', 23, '#a92520'); p++; y = INICIO; cabecera(true); };
    const fuenteTexto = '27px Georgia', interlinea = 36;
    const parrafos = (n.texto || '').split(/\n+/).filter(t => t.trim());
    for (const parrafo of parrafos) {
      const ls = lineas(parrafo, ancho, fuenteTexto);
      if (y + ls.length * interlinea <= FIN) { texto(p, x, y, ls, fuenteTexto, interlinea); y += ls.length * interlinea + 18; continue; }
      if (ls.length * interlinea <= FIN - (INICIO + altoTitulo + 28) && y > inicioTexto) { siguiente(); texto(p, x, y, ls, fuenteTexto, interlinea); y += ls.length * interlinea + 18; continue; }
      // Las oraciones son indivisibles. Una oración que no cabe se informa, no se corta.
      const oraciones = typeof Intl.Segmenter === 'function' ? [...new Intl.Segmenter('es', { granularity: 'sentence' }).segment(parrafo)].map(v => v.segment) : parrafo.match(/[^.!?]+[.!?]*(?:\s|$)/g) || [parrafo];
      let grupo = '';
      const emitir = () => { if (!grupo) return; const l = lineas(grupo, ancho, fuenteTexto); texto(p, x, y, l, fuenteTexto, interlinea); y += l.length * interlinea; grupo = ''; };
      for (const oracion of oraciones) {
        const l = lineas(grupo + oracion, ancho, fuenteTexto);
        if (y + l.length * interlinea > FIN) { emitir(); siguiente(); }
        const unidad = lineas(oracion, ancho, fuenteTexto);
        if (y + unidad.length * interlinea > FIN) throw new Error('Una oración completa no cabe en una página. Agrega un punto o separa el texto en párrafos más breves.');
        grupo += oracion;
      }
      emitir(); y += 18;
    }
    // Grupos de hasta dos fotos, cada recuadro queda íntegro en una página.
    for (let i = 0; i < n.fotos.length; i += 2) {
      const fotos = n.fotos.slice(i, i + 2), w = (ancho - (fotos.length - 1) * 14) / fotos.length;
      const h = Math.min(350, w * 0.7);
      if (y + h + 65 > FIN) siguiente();
      fotos.forEach((f, j) => {
        const fx = x + j * (w + 14);
        poner(p, { tipo: 'foto', foto: f, x: fx, y, ancho: w, alto: h });
        const pie = lineas(f.pie || '', w, '18px Arial');
        if (pie.length > 2) throw new Error('Un pie de foto es demasiado largo. Usa hasta dos líneas.');
        texto(p, fx, y + h + 8, pie, '18px Arial', 22);
      });
      y += h + 65;
    }
    poner(p, { tipo: 'rect', x, y: y + 4, ancho, alto: 2, color: '#a92520' });
    return { p, y: y + 32 };
  }
  let posicion = { p: 0, y: INICIO };
  for (const b of e.bloques) {
    if (b.tipo === 'agenda') {
      const n = { titulo: 'LO QUE VIENE', texto: b.eventos.map(v => `${v.fecha || 'Fecha por confirmar'} · ${v.descripcion}`).join('\n\n'), fotos: [] };
      posicion = articulo(n, 'destacada', posicion, MARGEN, ANCHO - MARGEN * 2);
    } else if (b.tipo === 'columnas') {
      const w = (ANCHO - 2 * MARGEN - 40) / 2;
      const a = articulo(b.notas[0], b.tipo, posicion, MARGEN, w);
      const d = articulo(b.notas[1], b.tipo, posicion, MARGEN + w + 40, w);
      for (let p = posicion.p; p <= Math.max(a.p, d.p); p++) poner(p, { tipo: 'rect', x: ANCHO / 2, y: p === posicion.p ? posicion.y : INICIO, ancho: 1, alto: Math.max(0, (p === Math.max(a.p, d.p) ? Math.max(a.p === p ? a.y : INICIO, d.p === p ? d.y : INICIO) : FIN) - (p === posicion.p ? posicion.y : INICIO)), color: '#756a5a' });
      posicion = a.p > d.p ? a : d.p > a.p ? d : { p: a.p, y: Math.max(a.y, d.y) };
    } else posicion = articulo(b.notas[0], b.tipo, posicion, MARGEN, ANCHO - MARGEN * 2);
  }
  if (!e.bloques.length) poner(0, { tipo: 'texto', x: 46, y: INICIO, texto: 'Agrega bloques para comenzar tu edición.', fuente: '30px Georgia', color: '#17130f' });
  const canvases = paginas.map((ops, indice) => {
    const canvas = document.createElement('canvas'); canvas.width = ANCHO; canvas.height = ALTO;
    const c = canvas.getContext('2d'); c.textBaseline = 'top';
    c.fillStyle = '#f7efdd'; c.fillRect(0, 0, ANCHO, ALTO);
    const dibujarTexto = (t, x, y, fuente, color = '#17130f') => { c.font = fuente; c.fillStyle = color; c.fillText(t, x, y); };
    dibujarTexto(`${e.nombre || `BOLETÍN N°${e.numero}`} · ${e.periodo}`.toUpperCase().slice(0, 85), 46, 26, 'bold 20px Arial');
    c.fillStyle = '#17130f'; c.fillRect(46, 60, 1188, 2);
    c.drawImage(escudo, 49, 80, 125, 125);
    dibujarTexto('EL JARA INFORMA', 200, 79, 'bold 88px Georgia');
    dibujarTexto('BOLETÍN · CLUB DEPORTIVO HUGO JARA', 203, 178, 'bold 26px Arial', '#a92520');
    dibujarTexto('TODOS JUEGAN · EDICIÓN DEMOSTRATIVA', 46, 226, 'bold 19px Arial', '#a92520');
    c.fillStyle = '#17130f'; c.fillRect(46, 252, 1188, 2);
    for (const op of ops) {
      if (op.tipo === 'texto') dibujarTexto(op.texto, op.x, op.y, op.fuente, op.color);
      if (op.tipo === 'rect') { c.fillStyle = op.color; c.fillRect(op.x, op.y, op.ancho, op.alto); }
      if (op.tipo === 'foto') {
        const { x, y, ancho: w, alto: h, foto: f } = op;
        c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
        if (f.demo) {
          c.fillStyle = '#c5c5aa'; c.fillRect(x, y, w, h); c.fillStyle = '#375744'; c.fillRect(x, y + h * 0.55, w, h * 0.45);
          c.strokeStyle = '#f7efdd'; c.lineWidth = 3; c.strokeRect(x + w * 0.15, y + h * 0.6, w * 0.7, h * 0.3);
          c.beginPath(); c.arc(x + w / 2, y + h * 0.75, h * 0.12, 0, Math.PI * 2); c.stroke();
          dibujarTexto('ILUSTRACIÓN DEMO', x + 15, y + 18, 'bold 18px Arial');
        } else {
          const img = recursos.get(f.src); const scale = Math.max(w / img.width, h / img.height) * f.zoom;
          const iw = img.width * scale, ih = img.height * scale;
          c.drawImage(img, x - (iw - w) * f.x / 100, y - (ih - h) * f.y / 100, iw, ih);
        }
        c.restore();
      }
    }
    c.fillStyle = '#a92520'; c.fillRect(0, 1520, ANCHO, 80);
    dibujarTexto('CLUB DEPORTIVO HUGO JARA · TODOS JUEGAN', 46, 1545, 'bold 24px Arial', '#fff7e6');
    dibujarTexto(`${indice + 1} / ${paginas.length}`, 1140, 1545, '26px Georgia', '#fff7e6');
    return canvas;
  });
  return canvases;
}
