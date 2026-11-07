// La misma composición en canvas alimenta la vista previa, el lector y los PNG.
export const ANCHO = 1280;
export const ALTO = 1600;
const INICIO = 270, FIN = 1460, MARGEN = 46;
const cargar = async src => { const i = new Image(); i.src = src; await i.decode(); return i; };
export async function componerEdicion(e) {
  const recursos = new Map();
  const escudo = await cargar(`${import.meta.env?.BASE_URL || "/"}escudo.jpg`);
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
  // Las disposiciones nuevas se aplican a la primera foto; las demás siguen al final.
  // La pasada de medición no dibuja y permite decidir si conviene iniciar en otra página.
  function articuloConFoto(n, tipo, posicion, x, ancho, medir = false) {
    let { p, y } = posicion;
    const disposicion = n.disposicion || 'abajo';
    const lateral = disposicion.startsWith('lado_') || disposicion.startsWith('rodear_');
    const rodear = disposicion.startsWith('rodear_');
    const izquierda = disposicion.endsWith('_izquierda');
    const fuenteTitulo = tipo === 'principal' ? 'bold 55px Georgia' : 'bold 39px Georgia';
    const saltoTitulo = tipo === 'principal' ? 60 : 45;
    const titulo = lineas(n.titulo || 'Noticia sin título', ancho, fuenteTitulo);
    const altoTitulo = titulo.length * saltoTitulo + 32;
    if (altoTitulo > FIN - INICIO - 100) throw new Error('Un titular ocupa demasiado espacio. Acórtalo antes de exportar.');
    const ponerOp = (pagina, op) => { if (!medir) poner(pagina, op); };
    const dibujar = (pagina, px, py, ls, fuente, paso, color) => { if (!medir) texto(pagina, px, py, ls, fuente, paso, color); };
    const cabecera = continuacion => {
      if (continuacion) { dibujar(p, x, y, ['CONTINUACIÓN'], 'bold 19px Arial', 24, '#a92520'); y += 28; }
      if (tipo === 'destacada') ponerOp(p, { tipo: 'rect', x: x - 8, y: y - 8, ancho: ancho + 16, alto: altoTitulo + 8, color: '#ebd9bc' });
      dibujar(p, x, y, titulo, fuenteTitulo, saltoTitulo); y += altoTitulo;
    };
    const siguiente = () => { dibujar(p, x, FIN + 4, ['Sigue en la página ' + (p + 2)], 'italic 18px Georgia', 23, '#a92520'); p++; y = INICIO; cabecera(true); };
    const foto = n.fotos[0];
    const fotoAncho = lateral ? Math.floor(ancho * 0.4) : ancho;
    const fotoAlto = Math.min(350, fotoAncho * 0.7);
    const pie = lineas(foto.pie || '', fotoAncho, '18px Arial');
    if (pie.length > 2) throw new Error('Un pie de foto es demasiado largo. Usa hasta dos líneas.');
    const espacioFoto = fotoAlto + Math.max(0, pie.length * 22) + 22;
    if (disposicion !== 'abajo' && altoTitulo + espacioFoto > FIN - INICIO) throw new Error('El titular y la foto no caben juntos. Acorta el titular o ubica la foto después del texto.');
    if (y + altoTitulo + (disposicion === 'abajo' ? 60 : espacioFoto) > FIN) { p++; y = INICIO; }
    cabecera(false);
    let paginaFoto = -1, finFoto = 0;
    const ponerFoto = (f, fx, fy, w, h, ls) => {
      ponerOp(p, { tipo: 'foto', foto: f, x: fx, y: fy, ancho: w, alto: h });
      dibujar(p, fx, fy + h + 8, ls, '18px Arial', 22);
    };
    if (disposicion !== 'abajo') {
      const fx = lateral && !izquierda ? x + ancho - fotoAncho : x;
      ponerFoto(foto, fx, y, fotoAncho, fotoAlto, pie);
      paginaFoto = p; finFoto = y + espacioFoto;
      if (!lateral) y = finFoto;
    }
    const parrafos = (n.texto || '').split(/\n+/).filter(t => t.trim());
    for (const parrafo of parrafos) {
      const palabras = parrafo.trim().split(/\s+/); let indice = 0;
      while (indice < palabras.length) {
        if (y + 36 > FIN) siguiente();
        const alLado = lateral && p === paginaFoto && (!rodear || y < finFoto);
        const tx = alLado && izquierda ? x + fotoAncho + 20 : x;
        const tw = alLado ? ancho - fotoAncho - 20 : ancho;
        medida.font = '27px Georgia'; let linea = '';
        while (indice < palabras.length) {
          const candidata = linea ? `${linea} ${palabras[indice]}` : palabras[indice];
          if (medida.measureText(candidata).width > tw) {
            if (!linea) throw new Error('Hay una palabra o enlace demasiado largo para la columna. Acórtalo antes de exportar.');
            break;
          }
          linea = candidata; indice++;
        }
        dibujar(p, tx, y, [linea], '27px Georgia', 36); y += 36;
      }
      y += 18;
    }
    if (lateral && p === paginaFoto) y = Math.max(y, finFoto);
    const pendientes = disposicion === 'abajo' ? n.fotos : n.fotos.slice(1);
    for (let i = 0; i < pendientes.length; i += 2) {
      const grupo = pendientes.slice(i, i + 2), w = (ancho - (grupo.length - 1) * 14) / grupo.length;
      const h = Math.min(350, w * 0.7);
      const pies = grupo.map(f => lineas(f.pie || '', w, '18px Arial'));
      if (pies.some(ls => ls.length > 2)) throw new Error('Un pie de foto es demasiado largo. Usa hasta dos líneas.');
      if (altoTitulo + 28 + h + 65 > FIN - INICIO) throw new Error('El titular y la foto no caben en una continuación. Acorta el titular.');
      if (y + h + 65 > FIN) siguiente();
      grupo.forEach((f, j) => ponerFoto(f, x + j * (w + 14), y, w, h, pies[j]));
      y += h + 65;
    }
    ponerOp(p, { tipo: 'rect', x, y: Math.min(y + 4, FIN), ancho, alto: 2, color: '#a92520' });
    return { p, y: y + 32 };
  }
  const avisos = [];
  function componerArticulo(n, tipo, posicion, x, ancho) {
    if (!n.fotos.length || (!n.disposicion && !n.mantenerJunta)) return articulo(n, tipo, posicion, x, ancho);
    let inicio = posicion;
    if (n.mantenerJunta) {
      const aqui = articuloConFoto(n, tipo, posicion, x, ancho, true);
      if (aqui.p > posicion.p) {
        const nueva = { p: posicion.p + 1, y: INICIO };
        const resultado = articuloConFoto(n, tipo, nueva, x, ancho, true);
        if (resultado.p === nueva.p) inicio = nueva;
        else avisos.push(`«${n.titulo || 'Noticia sin título'}» no cabe completa en una página y continúa en la siguiente.`);
      }
    }
    return articuloConFoto(n, tipo, inicio, x, ancho);
  }

  let posicion = { p: 0, y: INICIO };
  for (const b of e.bloques) {
    if (b.tipo === 'agenda') {
      const n = { titulo: 'LO QUE VIENE', texto: b.eventos.map(v => `${v.fecha || 'Fecha por confirmar'} · ${v.descripcion}`).join('\n\n'), fotos: [] };
      posicion = articulo(n, 'destacada', posicion, MARGEN, ANCHO - MARGEN * 2);
    } else if (b.tipo === 'columnas') {
      const w = (ANCHO - 2 * MARGEN - 40) / 2;
      const a = componerArticulo(b.notas[0], b.tipo, posicion, MARGEN, w);
      const d = componerArticulo(b.notas[1], b.tipo, posicion, MARGEN + w + 40, w);
      for (let p = posicion.p; p <= Math.max(a.p, d.p); p++) poner(p, { tipo: 'rect', x: ANCHO / 2, y: p === posicion.p ? posicion.y : INICIO, ancho: 1, alto: Math.max(0, (p === Math.max(a.p, d.p) ? Math.max(a.p === p ? a.y : INICIO, d.p === p ? d.y : INICIO) : FIN) - (p === posicion.p ? posicion.y : INICIO)), color: '#756a5a' });
      posicion = a.p > d.p ? a : d.p > a.p ? d : { p: a.p, y: Math.max(a.y, d.y) };
    } else posicion = componerArticulo(b.notas[0], b.tipo, posicion, MARGEN, ANCHO - MARGEN * 2);
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
  canvases.avisos = avisos;
  return canvases;
}
