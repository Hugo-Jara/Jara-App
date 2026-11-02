import { useEffect, useRef, useState } from 'react';
import { bloqueNuevo, TIPOS_BLOQUE, nombreEdicion } from '../../lib/boletinDatos.js';
import { guardarBorrador, leerFoto, respaldar } from '../../lib/boletinStorage.js';
import BoletinVista, { FotosNota } from './BoletinVista.jsx';
const mover = (lista, i, delta) => { const nueva = [...lista]; [nueva[i], nueva[i + delta]] = [nueva[i + delta], nueva[i]]; return nueva; };
function Orden({ i, largo, cambiar, quitar, objeto }) {
  return <div className="noticias-herramientas"><button type="button" className="btn secundario chico" disabled={!i} aria-label={`Subir ${objeto} ${i + 1}`} onClick={() => cambiar(-1)}>↑</button><button type="button" className="btn secundario chico" disabled={i === largo - 1} aria-label={`Bajar ${objeto} ${i + 1}`} onClick={() => cambiar(1)}>↓</button><button type="button" className="btn secundario chico" onClick={quitar}>Quitar {objeto}</button></div>;
}
function FotosEditor({ fotos, cambiar, error }) {
  const [cargando, setCargando] = useState(false);
  return <div className="noticias-fotos-editor">
    <label className="noticias-campo">Agregar fotografías (hasta 20 MB cada una)<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple disabled={cargando} onChange={async e => {
      const archivos = [...e.target.files]; e.target.value = ''; setCargando(true);
      try { const nuevas = []; for (const f of archivos) nuevas.push(await leerFoto(f)); cambiar([...fotos, ...nuevas]); } catch (e) { error(e.message); } finally { setCargando(false); }
    }} /></label>
    {cargando && <p role="status">Leyendo fotografías…</p>}
    {fotos.map((f, i) => <div className="noticias-foto-editor" key={f.id}><FotosNota fotos={[f]} />
      <Orden i={i} largo={fotos.length} objeto="foto" cambiar={d => cambiar(mover(fotos, i, d))} quitar={() => cambiar(fotos.filter((_, j) => i !== j))} />
      {[['x', 'Desplazar horizontalmente', 0, 100, 1], ['y', 'Desplazar verticalmente', 0, 100, 1], ['zoom', 'Ampliar fotografía', 1, 3, 0.1]].map(([campo, label, min, max, step]) => <label className="noticias-campo" key={campo}>{label}<input aria-label={`${label} ${i + 1}`} type="range" min={min} max={max} step={step} value={f[campo]} onChange={e => cambiar(fotos.map((v, j) => i === j ? { ...v, [campo]: Number(e.target.value) } : v))} /></label>)}
      <label className="noticias-campo">Pie de foto<input value={f.pie} maxLength="160" onChange={e => cambiar(fotos.map((v, j) => i === j ? { ...v, pie: e.target.value } : v))} /></label>
      <button type="button" className="enlace" onClick={() => cambiar(fotos.map((v, j) => i === j ? { ...v, x: 50, y: 50, zoom: 1 } : v))}>Restablecer encuadre automático</button>
    </div>)}
  </div>;
}
export default function BoletinEditor({ inicial, salir }) {
  const [edicion, setEdicion] = useState(inicial), [estado, setEstado] = useState('Guardado local'), [error, setError] = useState(''), [vista, setVista] = useState(false), [ocupado, setOcupado] = useState(false);
  const cola = useRef(Promise.resolve()), ultima = useRef(inicial), guardada = useRef(inicial), revision = useRef(0);
  const cambiar = fn => { setEdicion(prev => { const next = { ...fn(prev), modificada: new Date().toISOString() }; ultima.current = next; return next; }); setEstado('Cambios pendientes…'); };
  const guardar = e => {
    const rev = ++revision.current;
    cola.current = cola.current.catch(() => {}).then(() => guardarBorrador(e)).then(() => { guardada.current = e; if (rev === revision.current && ultima.current === e) { setEstado('Guardado local'); setError(''); } }).catch(err => { setEstado('No se pudo guardar'); setError(`No pudimos guardar el borrador. Revisa el espacio y exporta un respaldo antes de salir. ${err.message}`); throw err; });
    return cola.current;
  };
  useEffect(() => { const timer = setTimeout(() => { if (edicion !== guardada.current) guardar(edicion).catch(() => {}); }, 450); return () => clearTimeout(timer); }, [edicion]);
  useEffect(() => { const avisar = ev => { if (ultima.current !== guardada.current) { ev.preventDefault(); ev.returnValue = ''; } }; window.addEventListener('beforeunload', avisar); return () => { window.removeEventListener('beforeunload', avisar); if (ultima.current !== guardada.current) guardar(ultima.current).catch(() => {}); }; }, []);
  const volver = async () => { setOcupado(true); try { await guardar(ultima.current); salir(); } catch {} finally { setOcupado(false); } };
  const bloque = (id, fn) => cambiar(e => ({ ...e, bloques: e.bloques.map(b => b.id === id ? fn(b) : b) }));
  return <section className="noticias-boletin noticias-editor">
    <button className="enlace" disabled={ocupado} onClick={volver}>← Guardar y volver a borradores</button>
    <p className="noticias-etiqueta">EDITOR DEMO · SOLO EN ESTE NAVEGADOR</p><h2>{nombreEdicion(edicion)}</h2>
    <p role="status" aria-live="polite">{estado} {estado === 'Guardado local' && `· ${new Date(edicion.modificada).toLocaleString('es-CL')}`}</p>
    <p className="noticias-ayuda">No es una publicación oficial. Si borras los datos del navegador, perderás estos borradores y sus fotos. Guarda respaldos antes de cambiar de dispositivo. Evita editar la misma edición en dos pestañas.</p>
    {error && <p className="noticias-error" role="alert">{error}</p>}
    <div className="noticias-herramientas"><button className="btn secundario" onClick={() => setVista(!vista)}>{vista ? 'Volver a editar' : 'Vista previa y PNG'}</button><button className="btn secundario" onClick={() => respaldar(edicion)}>Exportar respaldo</button><button className="btn secundario" onClick={() => guardar(edicion).catch(() => {})}>Guardar ahora</button></div>
    {vista ? <BoletinVista edicion={edicion} local todas /> : <>
      <div className="noticias-metadatos">
        <label className="noticias-campo">Número de boletín<input type="number" min="1" max="99999" value={edicion.numero} onChange={ev => cambiar(e => ({ ...e, numero: Math.max(1, Math.min(99999, Number(ev.target.value) || 1)) }))} /></label>
        <p className="noticias-ayuda">Sugerencia local; no es una numeración oficial sincronizada.</p>
        {[['nombre', 'Nombre de edición especial (opcional)', 90], ['periodo', 'Fecha o periodo', 70], ['resumen', 'Resumen de la edición', 500]].map(([campo, label, max]) => <label className="noticias-campo" key={campo}>{label}<input value={edicion[campo]} maxLength={max} onChange={ev => cambiar(e => ({ ...e, [campo]: ev.target.value }))} /></label>)}
      </div>
      {edicion.bloques.map((b, i) => <fieldset className="noticias-bloque-editor" key={b.id}><legend>{i + 1}. {TIPOS_BLOQUE[b.tipo]}</legend>
        <Orden i={i} largo={edicion.bloques.length} objeto="bloque" cambiar={d => cambiar(e => ({ ...e, bloques: mover(e.bloques, i, d) }))} quitar={() => { if (confirm('¿Quitar este bloque y sus fotografías?')) cambiar(e => ({ ...e, bloques: e.bloques.filter(v => v.id !== b.id) })); }} />
        {b.tipo === 'agenda' ? <>
          {b.eventos.map((v, j) => <div key={v.id} className="noticias-evento"><label className="noticias-campo">Fecha de actividad<input value={v.fecha} maxLength="100" onChange={ev => bloque(b.id, b => ({ ...b, eventos: b.eventos.map(t => t.id === v.id ? { ...t, fecha: ev.target.value } : t) }))} /></label><label className="noticias-campo">Descripción<textarea value={v.descripcion} onChange={ev => bloque(b.id, b => ({ ...b, eventos: b.eventos.map(t => t.id === v.id ? { ...t, descripcion: ev.target.value } : t) }))} /></label><Orden i={j} largo={b.eventos.length} objeto="actividad" cambiar={d => bloque(b.id, b => ({ ...b, eventos: mover(b.eventos, j, d) }))} quitar={() => bloque(b.id, b => ({ ...b, eventos: b.eventos.filter(t => t.id !== v.id) }))} /></div>)}
          <button className="btn secundario" onClick={() => bloque(b.id, b => ({ ...b, eventos: [...b.eventos, { id: crypto.randomUUID(), fecha: '', descripcion: '' }] }))}>Agregar actividad</button>
        </> : b.notas.map((n, j) => {
          const nota = fn => bloque(b.id, b => ({ ...b, notas: b.notas.map(t => t.id === n.id ? fn(t) : t) }));
          return <div key={n.id} className="noticias-nota-editor">{b.tipo === 'columnas' && <h3>Noticia {j + 1}</h3>}<label className="noticias-campo">Titular<input value={n.titulo} maxLength="250" onChange={ev => nota(n => ({ ...n, titulo: ev.target.value }))} /></label><label className="noticias-campo">Texto de la noticia<textarea aria-label="Texto de la noticia" rows="6" value={n.texto} maxLength="200000" onChange={ev => nota(n => ({ ...n, texto: ev.target.value }))} /></label><FotosEditor fotos={n.fotos} cambiar={fotos => nota(n => ({ ...n, fotos }))} error={setError} /></div>;
        })}
      </fieldset>)}
      <div className="noticias-agregar"><h3>Agregar bloque</h3><div className="noticias-herramientas">{Object.entries(TIPOS_BLOQUE).map(([tipo, nombre]) => <button className="btn secundario" key={tipo} onClick={() => cambiar(e => ({ ...e, bloques: [...e.bloques, bloqueNuevo(tipo)] }))}>+ {nombre}</button>)}</div></div>
    </>}
  </section>;
}
