import { useEffect, useRef, useState } from 'react';
import { agregarFotos, actualizarFoto, bloqueNuevo, moverFoto, nombreEdicion, quitarFoto, DISPOSICIONES_FOTO, FUENTES_BOLETIN, TIPOS_BLOQUE } from '../../lib/boletinDatos.js';
import { guardarBorrador, leerFoto, respaldar } from '../../lib/boletinStorage.js';
import BoletinVista from './BoletinVista.jsx';
import EncuadreFoto from './EncuadreFoto.jsx';
import TextoEnriquecido from './TextoEnriquecido.jsx';
import { relacionFoto } from '../../lib/boletinEncuadre.js';
const mover = (lista, i, delta) => { const nueva = [...lista]; [nueva[i], nueva[i + delta]] = [nueva[i + delta], nueva[i]]; return nueva; };
function Orden({ i, largo, cambiar, quitar, objeto }) {
  return <div className="noticias-herramientas"><button type="button" className="btn secundario chico" disabled={!i} aria-label={`Subir ${objeto} ${i + 1}`} onClick={() => cambiar(-1)}>↑</button><button type="button" className="btn secundario chico" disabled={i === largo - 1} aria-label={`Bajar ${objeto} ${i + 1}`} onClick={() => cambiar(1)}>↓</button><button type="button" className="btn secundario chico" onClick={quitar}>Quitar {objeto}</button></div>;
}
// `cambiar` recibe una función que transforma la lista de fotos vigente. Así,
// si una carga termina mientras se edita otra foto (encuadre, pie, orden), la
// foto nueva se agrega sobre lo último guardado y no se pierde ningún ajuste.
function FotosEditor({ fotos, cambiar, error, avisarCarga, tipo, disposicion }) {
  const [cargando, setCargando] = useState(0);
  const cargar = async archivos => {
    setCargando(n => n + 1); avisarCarga(1);
    const fallas = [];
    try {
      for (const f of archivos) {
        try { const foto = await leerFoto(f); cambiar(actuales => agregarFotos(actuales, [foto])); }
        catch (e) { fallas.push(`${f.name}: ${e.message}`); }
      }
      if (fallas.length) error(`No se agregaron ${fallas.length} de ${archivos.length} fotografías. ${fallas.join(' ')}`);
    } finally { setCargando(n => n - 1); avisarCarga(-1); }
  };
  return <div className="noticias-fotos-editor">
    <label className="noticias-campo">Agregar fotografías (hasta 20 MB cada una)<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple onChange={e => { const archivos = [...e.target.files]; e.target.value = ''; if (archivos.length) cargar(archivos); }} /></label>
    {cargando > 0 && <p role="status">Leyendo fotografías… Puedes seguir ajustando las que ya están. Espera a que terminen para abrir la vista previa.</p>}
    {fotos.map((f, i) => <div className="noticias-foto-editor" key={f.id}><EncuadreFoto foto={f} relacion={relacionFoto(tipo, disposicion, i, fotos.length)} cambiar={cambios => cambiar(actuales => actualizarFoto(actuales, f.id, cambios))} />
      <label className="noticias-campo">Cómo mostrar la foto<select value={f.mostrarCompleta ? 'completa' : 'llenar'} onChange={e => { const mostrarCompleta = e.target.value === 'completa'; cambiar(actuales => actualizarFoto(actuales, f.id, { mostrarCompleta })); }}><option value="llenar">Llenar el espacio (encuadrar)</option><option value="completa">Mostrar foto completa</option></select></label>
      <Orden i={i} largo={fotos.length} objeto="foto" cambiar={d => cambiar(actuales => moverFoto(actuales, f.id, d))} quitar={() => cambiar(actuales => quitarFoto(actuales, f.id))} />
      {!f.mostrarCompleta && <details><summary>Ajustes precisos de encuadre</summary>{[['x', 'Desplazar horizontalmente', 0, 100, 1], ['y', 'Desplazar verticalmente', 0, 100, 1], ['zoom', 'Ampliar fotografía', 1, 3, 0.1]].map(([campo, label, min, max, step]) => <label className="noticias-campo" key={campo}>{label}<input aria-label={`${label} ${i + 1}`} type="range" min={min} max={max} step={step} value={f[campo]} onChange={e => { const valor = Number(e.target.value); cambiar(actuales => actualizarFoto(actuales, f.id, { [campo]: valor })); }} /></label>)}
      </details>}
      <label className="noticias-campo">Pie de foto<input aria-label={`Pie de foto ${i + 1}`} value={f.pie} maxLength="160" onChange={e => { const pie = e.target.value; cambiar(actuales => actualizarFoto(actuales, f.id, { pie })); }} /></label>
      <button type="button" className="enlace" onClick={() => cambiar(actuales => actualizarFoto(actuales, f.id, { x: 50, y: 50, zoom: 1 }))}>Restablecer encuadre automático</button>
    </div>)}
  </div>;
}
const DESCRIPCIONES = {
  principal: 'Titular grande para la noticia principal.', columnas: 'Dos noticias, una junto a la otra.',
  breve: 'Una noticia de formato sencillo.', destacada: 'Destaca el titular con un fondo de color.', agenda: 'Fechas y actividades próximas.', frase: 'Una frase centrada para destacar una idea.', cierre: 'Un mensaje para cerrar la edición.',
};
function Esquema({ tipo }) {
  return <span className={`noticias-esquema noticias-esquema-${tipo}`} aria-hidden="true"><i className="esquema-titulo"/><i className="esquema-foto"/><i className="esquema-texto"/><i className="esquema-texto2"/></span>;
}
function Distribucion({ nota, cambiar }) {
  const actual = nota.disposicion || 'abajo';
  return <fieldset className="noticias-distribucion"><legend>Distribución de la primera foto</legend>
    <p className="noticias-ayuda">Elige cómo combinar la noticia y la foto. Las fotos adicionales van después del texto.</p>
    <div className="noticias-disposiciones" role="group" aria-label="Distribución de la primera foto">
      {Object.entries(DISPOSICIONES_FOTO).map(([valor, nombre]) => <button type="button" className="noticias-opcion-disposicion" aria-pressed={actual === valor} key={valor} onClick={() => cambiar(n => ({ ...n, disposicion: valor }))}><Esquema tipo={valor}/><span>{nombre}</span></button>)}
    </div>
    <label className="noticias-mantener"><input type="checkbox" checked={!!nota.mantenerJunta} onChange={e => cambiar(n => ({ ...n, mantenerJunta: e.target.checked }))}/> Intentar mantener noticia y fotos juntas</label>
    <p className="noticias-ayuda">Si no caben en una página, la noticia continúa en la siguiente. Revisa el resultado en Vista previa.</p>
  </fieldset>;
}
export default function BoletinEditor({ inicial, salir }) {
  const [edicion, setEdicion] = useState(inicial), [estado, setEstado] = useState('Guardado local'), [error, setError] = useState(''), [vista, setVista] = useState(false), [ocupado, setOcupado] = useState(false), [cargas, setCargas] = useState(0);
  const cargasActivas = useRef(0), posicionEditor = useRef(0);
  const cambiarVista = () => {
    if (cargasActivas.current) return;
    if (!vista) { posicionEditor.current = window.scrollY; setVista(true); window.scrollTo(0, 0); }
    else { setVista(false); requestAnimationFrame(() => window.scrollTo(0, posicionEditor.current)); }
  };
  const avisarCarga = d => { cargasActivas.current += d; setCargas(cargasActivas.current); };
  const cola = useRef(Promise.resolve()), ultima = useRef(inicial), guardada = useRef(inicial), revision = useRef(0);
  const cambiar = fn => { setEdicion(prev => { const next = { ...fn(prev), modificada: new Date().toISOString() }; ultima.current = next; return next; }); setEstado('Cambios pendientes…'); };
  const guardar = e => {
    const rev = ++revision.current;
    cola.current = cola.current.catch(() => {}).then(() => guardarBorrador(e)).then(() => { guardada.current = e; if (rev === revision.current && ultima.current === e) { setEstado('Guardado local'); setError(''); } }).catch(err => { setEstado('No se pudo guardar'); setError(`No pudimos guardar el borrador. Revisa el espacio y exporta un respaldo antes de salir. ${err.message}`); throw err; });
    return cola.current;
  };
  useEffect(() => { const timer = setTimeout(() => { if (edicion !== guardada.current) guardar(edicion).catch(() => {}); }, 450); return () => clearTimeout(timer); }, [edicion]);
  useEffect(() => { const avisar = ev => { if (ultima.current !== guardada.current || cargasActivas.current > 0) { ev.preventDefault(); ev.returnValue = ''; } }; window.addEventListener('beforeunload', avisar); return () => { window.removeEventListener('beforeunload', avisar); if (ultima.current !== guardada.current) guardar(ultima.current).catch(() => {}); }; }, []);
  const volver = async () => { setOcupado(true); try { await guardar(ultima.current); salir(); } catch {} finally { setOcupado(false); } };
  const bloque = (id, fn) => cambiar(e => ({ ...e, bloques: e.bloques.map(b => b.id === id ? fn(b) : b) }));
  return <section className="noticias-boletin noticias-editor" lang="es-CL">
    <button className="enlace" disabled={ocupado || cargas > 0} onClick={volver}>← Guardar y volver a borradores</button>
    {cargas > 0 && <p className="noticias-ayuda" role="status">Espera a que terminen de cargar las fotografías para volver a los borradores.</p>}
    <p className="noticias-etiqueta">EDITOR DEMO · SOLO EN ESTE NAVEGADOR</p><h2>{nombreEdicion(edicion)}</h2>
    <p role="status" aria-live="polite">{estado} {estado === 'Guardado local' && `· ${new Date(edicion.modificada).toLocaleString('es-CL')}`}</p>
    <p className="noticias-ayuda">No es una publicación oficial. Si borras los datos del navegador, perderás estos borradores y sus fotos. Guarda respaldos antes de cambiar de dispositivo. Evita editar la misma edición en dos pestañas.</p>
    {error && <p className="noticias-error" role="alert">{error}</p>}
    <div className="noticias-herramientas"><button className="btn secundario" disabled={cargas > 0} onClick={cambiarVista}>{vista ? 'Volver a editar' : 'Vista previa y PNG'}</button><button className="btn secundario" onClick={() => respaldar(edicion)}>Exportar respaldo</button><button className="btn secundario" onClick={() => guardar(edicion).catch(() => {})}>Guardar ahora</button></div>
    <button type="button" className="btn noticias-vista-flotante" disabled={cargas > 0} onClick={cambiarVista}>{vista ? '← Volver a editar' : '👁 Vista previa'}</button>
    {vista ? <BoletinVista edicion={edicion} local todas /> : <>
      <div className="noticias-metadatos">
        <label className="noticias-campo">Número de boletín<input type="number" min="1" max="99999" value={edicion.numero} onChange={ev => cambiar(e => ({ ...e, numero: Math.max(1, Math.min(99999, Number(ev.target.value) || 1)) }))} /></label>
        <p className="noticias-ayuda">Sugerencia local; no es una numeración oficial sincronizada.</p>
        {[['nombre', 'Nombre de edición especial (opcional)', 90], ['periodo', 'Fecha o periodo', 70], ['resumen', 'Resumen de la edición', 500]].map(([campo, label, max]) => <label className="noticias-campo" key={campo}>{label}<input value={edicion[campo]} maxLength={max} onChange={ev => cambiar(e => ({ ...e, [campo]: ev.target.value }))} /></label>)}
        <label className="noticias-campo">Letra del boletín<select value={edicion.fuente || 'Georgia'} onChange={ev => { const fuente = ev.target.value; cambiar(e => ({ ...e, fuente })); }}>{Object.keys(FUENTES_BOLETIN).map(f => <option key={f} value={f}>{f}</option>)}</select></label>
      </div>
      {edicion.bloques.map((b, i) => <fieldset className="noticias-bloque-editor" key={b.id}><legend>{i + 1}. {TIPOS_BLOQUE[b.tipo]}</legend>
        <Orden i={i} largo={edicion.bloques.length} objeto="bloque" cambiar={d => cambiar(e => ({ ...e, bloques: mover(e.bloques, i, d) }))} quitar={() => { if (confirm('¿Quitar este bloque y sus fotografías?')) cambiar(e => ({ ...e, bloques: e.bloques.filter(v => v.id !== b.id) })); }} />
        {b.tipo === 'agenda' ? <>
          {b.eventos.map((v, j) => <div key={v.id} className="noticias-evento"><label className="noticias-campo">Fecha de actividad<input value={v.fecha} maxLength="100" onChange={ev => bloque(b.id, b => ({ ...b, eventos: b.eventos.map(t => t.id === v.id ? { ...t, fecha: ev.target.value } : t) }))} /></label><label className="noticias-campo">Nombre de la actividad<input value={v.titulo || ''} maxLength="120" onChange={ev => { const titulo = ev.target.value; bloque(b.id, b => ({ ...b, eventos: b.eventos.map(t => t.id === v.id ? { ...t, titulo } : t) })); }} /></label><label className="noticias-campo">Descripción<textarea value={v.descripcion} onChange={ev => bloque(b.id, b => ({ ...b, eventos: b.eventos.map(t => t.id === v.id ? { ...t, descripcion: ev.target.value } : t) }))} /></label><Orden i={j} largo={b.eventos.length} objeto="actividad" cambiar={d => bloque(b.id, b => ({ ...b, eventos: mover(b.eventos, j, d) }))} quitar={() => bloque(b.id, b => ({ ...b, eventos: b.eventos.filter(t => t.id !== v.id) }))} /></div>)}
          <button className="btn secundario" onClick={() => bloque(b.id, b => ({ ...b, eventos: [...b.eventos, { id: crypto.randomUUID(), fecha: '', titulo: '', descripcion: '' }] }))}>Agregar actividad</button>
        </> : b.notas.map((n, j) => {
          const nota = fn => bloque(b.id, b => ({ ...b, notas: b.notas.map(t => t.id === n.id ? fn(t) : t) }));
          if (b.tipo === 'frase' || b.tipo === 'cierre') return <div key={n.id} className="noticias-nota-editor"><label className="noticias-campo">{b.tipo === 'frase' ? 'Frase destacada' : 'Mensaje de cierre'}<textarea spellCheck lang="es-CL" rows="4" value={n.texto} maxLength="200000" onChange={ev => { const texto = ev.target.value; nota(n => ({ ...n, texto, formatos: [] })); }} /></label><p className="noticias-ayuda">Aparecerá centrado, entre líneas divisorias.</p></div>;
          return <div key={n.id} className="noticias-nota-editor">{b.tipo === 'columnas' && <h3>Noticia {j + 1}</h3>}<label className="noticias-campo">Titular<input value={n.titulo} maxLength="250" onChange={ev => nota(n => ({ ...n, titulo: ev.target.value }))} /></label><label className="noticias-campo">Categoría (opcional)<input value={n.categoria || ''} maxLength="70" placeholder="Ej.: Deportes" onChange={ev => { const categoria = ev.target.value; nota(n => ({ ...n, categoria })); }} /></label>
          <div className="noticias-ajustes-texto"><label className="noticias-campo">Tamaño del titular<select value={n.tamanoTitulo || 'auto'} onChange={ev => { const tamanoTitulo = ev.target.value; nota(n => ({ ...n, tamanoTitulo })); }}>{[['auto','Automático'],['pequeno','Pequeño'],['mediano','Mediano'],['grande','Grande']].map(([v,t]) => <option value={v} key={v}>{t}</option>)}</select></label>
          <label className="noticias-campo">Alinear titular<select value={n.alineacionTitulo || 'izquierda'} onChange={ev => { const alineacionTitulo = ev.target.value; nota(n => ({ ...n, alineacionTitulo })); }}>{[['izquierda','Izquierda'],['centro','Centro'],['derecha','Derecha']].map(([v,t]) => <option value={v} key={v}>{t}</option>)}</select></label>
          <label className="noticias-campo">Tamaño del texto<select value={n.tamanoTexto || 'auto'} onChange={ev => { const tamanoTexto = ev.target.value; nota(n => ({ ...n, tamanoTexto })); }}>{[['auto','Automático'],['pequeno','Pequeño'],['mediano','Mediano'],['grande','Grande']].map(([v,t]) => <option value={v} key={v}>{t}</option>)}</select></label>
          <label className="noticias-campo">Alinear texto<select value={n.alineacionTexto || 'izquierda'} onChange={ev => { const alineacionTexto = ev.target.value; nota(n => ({ ...n, alineacionTexto })); }}>{[['izquierda','Izquierda'],['centro','Centro'],['derecha','Derecha'],['justificado','Justificado']].map(([v,t]) => <option value={v} key={v}>{t}</option>)}</select></label></div>
          <TextoEnriquecido nota={n} cambiar={nota} />{n.fotos.length > 0 && <Distribucion nota={n} cambiar={nota} />}<FotosEditor tipo={b.tipo} disposicion={n.disposicion || 'abajo'} fotos={n.fotos} cambiar={fn => nota(n => ({ ...n, fotos: fn(n.fotos) }))} error={setError} avisarCarga={avisarCarga} /></div>;
        })}
      </fieldset>)}
      <div className="noticias-agregar"><h3>Agregar bloque</h3><div className="noticias-tipos">{Object.entries(TIPOS_BLOQUE).map(([tipo, nombre]) => <button type="button" className="noticias-tipo" key={tipo} onClick={() => cambiar(e => ({ ...e, bloques: [...e.bloques, bloqueNuevo(tipo)] }))}><Esquema tipo={tipo}/><span><strong>+ {nombre}</strong><small>{DESCRIPCIONES[tipo]}</small></span></button>)}</div></div>
    </>}
  </section>;
}
