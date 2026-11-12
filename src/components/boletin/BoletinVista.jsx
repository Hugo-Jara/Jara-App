import { useEffect, useRef, useState } from 'react';
import { esDemo } from '../../lib/supabase.js';
import { componerEdicion } from '../../lib/boletinComposicion.js';
import { descargar } from '../../lib/boletinStorage.js';
import { nombreEdicion } from '../../lib/boletinDatos.js';
import { TextoFormateado } from './TextoEnriquecido.jsx';
import { relacionFoto } from '../../lib/boletinEncuadre.js';
import { columnaDe } from '../../lib/boletinColumnas.js';
import { firmaPagina, proponerAjuste } from '../../lib/boletinAjuste.js';

export function useComposicion(edicion) {
  const [estado, setEstado] = useState({ paginas: [], error: '', cargando: true });
  useEffect(() => {
    let vigente = true;
    setEstado({ paginas: [], error: '', cargando: true });
    const timer = setTimeout(() => componerEdicion(edicion, { demostrativa: esDemo }).then(paginas => { if (vigente) setEstado({ paginas, error: '', cargando: false }); }).catch(e => { if (vigente) setEstado({ paginas: [], error: `No podemos diagramar esta edición: ${e.message}`, cargando: false }); }), 350);
    return () => { vigente = false; clearTimeout(timer); };
  }, [edicion]);
  return estado;
}
const tamanoSeccion = { auto: 32, pequeno: 30, mediano: 32, grande: 36 };
const tamanoIntroduccion = { auto: 17, pequeno: 16, mediano: 17, grande: 19 };
function Pagina({ canvas, numero }) {
  const ref = useRef();
  useEffect(() => { if (canvas) ref.current.replaceChildren(canvas); }, [canvas]);
  return <div className="noticias-pagina" ref={ref} role="img" aria-label={`Página ${numero} del periódico. El mismo contenido está disponible en Lectura móvil.`} />;
}
export function FotosNota({ fotos, tipo = 'breve', disposicion = 'abajo', indiceInicial = 0, cantidadTotal = fotos.length }) {
  return <div className="noticias-fotos-lectura">{fotos.map((f, i) => <figure key={f.id}><div className="noticias-foto-marco" style={{ aspectRatio: relacionFoto(tipo, disposicion, i + indiceInicial, cantidadTotal) }}>{f.src ? <img src={f.src} alt={f.pie || 'Fotografía de la noticia'} style={{ width: '100%', height: '100%', objectFit: f.mostrarCompleta ? 'contain' : 'cover', objectPosition: `${f.x}% ${f.y}%`, transform: `scale(${f.mostrarCompleta ? 1 : f.zoom})`, transformOrigin: `${f.x}% ${f.y}%` }} /> : <div className="noticias-ilustracion">Cancha de ejemplo · Ilustración demo</div>}</div>{f.pie && <figcaption>{f.pie}</figcaption>}</figure>)}</div>;
}
export default function BoletinVista({ edicion, local = false, todas = false, alAplicar, alMarcar, alDeshacer, alVolverEditar, puedeDeshacer = false, soloLectura = false }) {
  const [propuesta, setPropuesta] = useState(null), [ajustando, setAjustando] = useState(false), [avisoAjuste, setAvisoAjuste] = useState('');
  const edicionVisible = propuesta?.edicion || edicion;
  const { paginas, error, cargando } = useComposicion(edicionVisible);
  const [movil, setMovil] = useState(soloLectura), [actual, setActual] = useState(0), [zoom, setZoom] = useState(1), [exportando, setExportando] = useState(false), [fallo, setFallo] = useState('');
  const toque = useRef(null), visorRef = useRef(null), yaEnfocado = useRef(false);
  useEffect(() => { if (local && !cargando && !yaEnfocado.current && paginas.length) { yaEnfocado.current = true; requestAnimationFrame(() => visorRef.current?.scrollIntoView({ block: 'start' })); } }, [local, cargando, paginas.length]);
  const indice = Math.min(actual, Math.max(0, paginas.length - 1));
  const ajustar = async () => {
    setAjustando(true); setAvisoAjuste('');
    try { const resultado = await proponerAjuste(edicion, paginas, indice, e => componerEdicion(e, { demostrativa: esDemo })); if (resultado.error) setAvisoAjuste(resultado.error); else { setPropuesta(resultado); setAvisoAjuste('Revisa la propuesta. El tamaño automático de algunos textos y los espacios pueden reducirse; las páginas siguientes pueden reorganizarse.'); } }
    finally { setAjustando(false); }
  };
  const firmas = paginas.operaciones?.map(ops => firmaPagina(edicionVisible, ops)) || [];
  const listas = edicion.paginasListas || [];
  const estadoLista = listas.find(p => p.indice === indice);
  const desactualizadas = listas.filter(p => firmas[p.indice] !== p.firma).map(p => p.indice + 1);
  const guardar = async (canvas, i) => {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('No hay memoria suficiente para generar el PNG.');
    descargar(blob, `Jara-Informa-N${String(edicion.numero).padStart(2, '0')}-Pagina-${String(i + 1).padStart(2, '0')}.png`);
  };
  const exportar = async todos => {
    setExportando(true); setFallo('');
    try { if (todos) { for (let i = 0; i < paginas.length; i++) await guardar(paginas[i], i); } else await guardar(paginas[indice], indice); }
    catch (e) { setFallo(`No se pudo descargar: ${e.message}`); }
    finally { setExportando(false); }
  };
  return <section className="noticias-boletin">
    <p className="noticias-etiqueta">{local ? 'VISTA PREVIA LOCAL · NO PUBLICADA' : esDemo ? 'CATÁLOGO DEMO · CONTENIDO FICTICIO' : 'EL PERIÓDICO DEL CLUB'}</p>
    <h2>{nombreEdicion(edicion)}</h2><p>{edicion.periodo}</p><p>{edicion.resumen}</p>
    <div className="noticias-herramientas" hidden={soloLectura}><button className="btn secundario" aria-pressed={!movil} disabled={ajustando} onClick={() => setMovil(false)}>Vista periódico</button><button className="btn secundario" aria-pressed={movil} disabled={!!propuesta || ajustando} onClick={() => setMovil(true)}>Lectura móvil</button></div>
    {paginas.avisos?.map((aviso, i) => <p className="noticias-aviso-distribucion" role="status" key={i}>{aviso}</p>)}
    {local && !propuesta && desactualizadas.length > 0 && !cargando && <p role="status" className="noticias-aviso-distribucion">Revisa nuevamente las páginas marcadas como listas: {desactualizadas.join(', ')}. Su contenido cambió.</p>}
    {avisoAjuste && <p role="status" className="noticias-aviso-distribucion">{avisoAjuste}</p>}
    {error && <p role="alert" className="noticias-error">{error} La exportación está bloqueada hasta corregirlo.</p>}
    {cargando && <p role="status">Diagramando páginas…</p>}
    {movil ? <div className="noticias-lectura" style={{ fontFamily: edicion.fuente || 'Georgia' }}><h3>EL JARA INFORMA</h3>{edicion.bloques.map(b => <section key={b.id} className={`noticias-lectura-${b.tipo}`}>
      {b.tipo === 'columnas' && (b.tituloSeccion || b.introduccion) && <div className="noticias-introduccion-lectura">{b.tituloSeccion && <h3 style={{ fontSize: tamanoSeccion[b.tamanoTituloSeccion || 'auto'] }}>{b.tituloSeccion}</h3>}{b.introduccion && <p style={{ fontSize: tamanoIntroduccion[b.tamanoIntroduccion || 'auto'] }}><TextoFormateado texto={b.introduccion} formatos={b.formatosIntroduccion} /></p>}</div>}
      {b.tipo === 'agenda' ? <><h3>Lo que viene</h3>{b.eventos.map(v => <p key={v.id}><strong>{v.fecha || 'Fecha por confirmar'}</strong><br />{v.titulo && <><strong>{v.titulo}</strong><br /></>}{v.descripcion}</p>)}</> : ['frase','cierre'].includes(b.tipo) ? <p className="noticias-frase-movil">{b.notas[0].texto}</p> : (b.tipo === 'columnas' ? ['izquierda','derecha'].flatMap(col => b.notas.filter((n, i) => columnaDe(n, i) === col)) : b.notas).map(n => <article key={n.id}>{n.categoria && <p className="noticias-lectura-categoria">{n.categoria}</p>}<h3 style={{ textAlign: n.alineacionTitulo === 'centro' ? 'center' : n.alineacionTitulo === 'derecha' ? 'right' : 'left' }}>{n.titulo || 'Noticia sin título'}</h3>{n.disposicion === 'arriba' && <FotosNota fotos={n.fotos.slice(0, 1)} tipo={b.tipo} disposicion={n.disposicion} cantidadTotal={n.fotos.length} />}<p style={{ textAlign: n.alineacionTexto === 'centro' ? 'center' : n.alineacionTexto === 'derecha' ? 'right' : n.alineacionTexto === 'justificado' ? 'justify' : 'left' }}><TextoFormateado texto={n.texto} formatos={n.formatos} /></p><FotosNota fotos={n.disposicion === 'arriba' ? n.fotos.slice(1) : n.fotos} tipo={b.tipo} disposicion={n.disposicion} indiceInicial={n.disposicion === 'arriba' ? 1 : 0} cantidadTotal={n.fotos.length} /></article>)}
    </section>)}</div> : !!paginas.length && <>
      <div ref={visorRef}>{local && <button type="button" className="btn secundario" disabled={ajustando} onClick={alVolverEditar}>← Volver a editar</button>}<div className="noticias-herramientas"><button className="btn secundario" disabled={ajustando || indice === 0} onClick={() => setActual(indice - 1)}>← Anterior</button><span aria-live="polite">Página {indice + 1} de {paginas.length}</span><button className="btn secundario" disabled={ajustando || indice === paginas.length - 1} onClick={() => setActual(indice + 1)}>Siguiente →</button></div></div>
      {local && <div className="noticias-herramientas noticias-ajuste-pagina">{propuesta ? <><button type="button" className="btn" onClick={() => { alAplicar(propuesta); setPropuesta(null); setAvisoAjuste('Ajuste aplicado. Las páginas posteriores pueden haberse reorganizado.'); }}>Aplicar ajuste</button><button type="button" className="btn secundario" onClick={() => { setPropuesta(null); setAvisoAjuste('Propuesta descartada.'); }}>Descartar propuesta</button></> : <><button type="button" className="btn secundario" disabled={cargando || ajustando || indice >= paginas.length - 1} onClick={ajustar}>{ajustando ? 'Buscando ajuste…' : 'Ajustar esta página'}</button><button type="button" className="btn secundario" disabled={cargando || ajustando || !firmas[indice]} onClick={() => alMarcar(indice, estadoLista?.firma === firmas[indice] ? null : firmas[indice])}>{estadoLista?.firma === firmas[indice] ? 'Quitar marca de lista' : 'Marcar página lista'}</button>{puedeDeshacer && <button type="button" className="btn secundario" onClick={alDeshacer}>Deshacer último ajuste</button>}</>}</div>}
      <label className="noticias-campo">Ampliar página <input aria-label="Ampliar página" type="range" min="1" max="3" step="0.25" value={zoom} onChange={e => setZoom(Number(e.target.value))} /></label>
      <div className="noticias-visor" onTouchStart={e => { toque.current = e.touches[0].clientX; }} onTouchEnd={e => { if (ajustando || zoom !== 1 || toque.current == null) return; const dx = e.changedTouches[0].clientX - toque.current; if (Math.abs(dx) > 55) setActual(Math.max(0, Math.min(paginas.length - 1, indice + (dx < 0 ? 1 : -1)))); toque.current = null; }}>
        <div style={{ width: `${zoom * 100}%` }}><Pagina canvas={paginas[indice]} numero={indice + 1} /></div>
      </div>
      {todas && paginas.length > 1 && <details><summary>Revisar todas las páginas ({paginas.length})</summary><div className="noticias-miniaturas">{paginas.map((p, i) => <button key={i} onClick={() => setActual(i)} aria-label={`Ir a página ${i + 1}`}><img src={p.toDataURL('image/png')} alt={`Página ${i + 1}`} /></button>)}</div></details>}
    </>}
    <div className="noticias-herramientas"><button className="btn" disabled={!paginas.length || cargando || exportando || !!propuesta || ajustando} onClick={() => exportar(false)}>Descargar página {indice + 1}</button><button className="btn secundario" disabled={!paginas.length || cargando || exportando || !!propuesta || ajustando} onClick={() => exportar(true)}>{exportando ? 'Preparando PNG…' : 'Descargar todas'}</button></div>
    <p className="noticias-ayuda">PNG de 1280 × 1600. Si tu navegador bloquea varias descargas, cambia de página y usa «Descargar página» para guardarlas una por una. Al ampliar, desplázate dentro del periódico.</p>
    {fallo && <p role="alert" className="noticias-error">{fallo}</p>}
  </section>;
}
