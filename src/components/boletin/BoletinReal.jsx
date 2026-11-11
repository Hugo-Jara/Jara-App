import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSesion } from '../../lib/sesion.jsx';
import { edicionNueva, validarEdicion } from '../../lib/boletinDatos.js';
import * as api from '../../lib/boletin.js';
import BoletinEditor from './BoletinEditor.jsx';
import BoletinVista from './BoletinVista.jsx';

export function TarjetaReal({ edicion, ultima = false }) {
  const [portada, setPortada] = useState('');
  useEffect(() => { let vigente = true; if (edicion.carpeta) api.urlArchivo(api.paginaRuta(edicion.carpeta, 1)).then(url => { if (vigente) setPortada(url); }).catch(() => {}); return () => { vigente = false; }; }, [edicion.carpeta]);
  return <article className="noticias-edicion-card">{portada && <img className="noticias-portada" src={portada} alt={`Portada de edición ${edicion.numero}`} />}<div>{ultima && <p className="noticias-etiqueta">ÚLTIMA EDICIÓN</p>}<h3>{edicion.titulo || `El Jara Informa N°${edicion.numero}`}</h3><p>{edicion.fecha_edicion}</p><p>{edicion.resumen}</p><Link className="btn" to={`/noticias?edicion=${edicion.id}`}>Leer edición</Link></div></article>;
}
export function UltimoBoletin() {
  const [edicion, setEdicion] = useState(null), [error, setError] = useState('');
  const cargar = () => api.ultimaEdicion().then(e => { setEdicion(e); setError(''); }).catch(e => setError(e.message));
  useEffect(() => { cargar(); }, []);
  return error ? <section className="card"><p role="alert">{error}</p><button className="btn secundario" onClick={cargar}>Reintentar boletín</button></section> : edicion && <section className="card"><TarjetaReal edicion={edicion} ultima /></section>;
}
function Lector({ id }) {
  const [datos, setDatos] = useState(null), [paginas, setPaginas] = useState([]), [error, setError] = useState(''), [movil, setMovil] = useState(false), [actual, setActual] = useState(0);
  useEffect(() => { let vigente = true; (async () => {
    const e = await api.obtenerEdicion(id);
    const urls = await Promise.all(Array.from({ length: e.paginas }, (_, i) => api.urlArchivo(api.paginaRuta(e.carpeta, i + 1))));
    const contenido = e.contenido_publicado ? await api.contenidoEditable({ contenido: e.contenido_publicado }) : null;
    if (vigente) { setDatos({ ...e, contenido }); setPaginas(urls); }
  })().catch(e => { if (vigente) setError(e.message); }); return () => { vigente = false; }; }, [id]);
  if (error) return <p role="alert">{error}</p>;
  if (!datos) return <p role="status">Cargando edición…</p>;
  return <section className="noticias-boletin"><h2>{datos.titulo || `El Jara Informa N°${datos.numero}`}</h2>{datos.contenido && <button className="btn secundario" onClick={() => setMovil(!movil)}>{movil ? 'Vista periódico' : 'Lectura móvil'}</button>}{movil ? <BoletinVista edicion={datos.contenido} soloLectura /> : paginas.length ? <><div className="noticias-herramientas"><button className="btn secundario" disabled={!actual} onClick={() => setActual(actual - 1)}>← Anterior</button><span>Página {actual + 1} de {paginas.length}</span><button className="btn secundario" disabled={actual === paginas.length - 1} onClick={() => setActual(actual + 1)}>Siguiente →</button></div><div className="noticias-visor"><img style={{ width: '100%' }} src={paginas[actual]} alt={`Página ${actual + 1} de la edición ${datos.numero}`} /></div></> : <p>Esta edición todavía no tiene páginas publicadas.</p>}</section>;
}
function Historica({ lista, terminar, inicial }) {
  const [e, setE] = useState(() => inicial ? { ...edicionNueva(inicial.numero), id: inicial.id, nombre: inicial.titulo, periodo: inicial.fecha_edicion, resumen: inicial.resumen } : edicionNueva(Math.max(0, ...lista.map(e => e.numero)) + 1)), [archivos, setArchivos] = useState([]), [error, setError] = useState(''), [ocupado, setOcupado] = useState(false), [creada, setCreada] = useState(inicial || null);
  const enviar = async publicar => {
    setOcupado(true); setError('');
    try {
      if (!archivos.length || archivos.length > 40) throw new Error('Selecciona entre 1 y 40 páginas PNG.');
      for (const f of archivos) { if (f.type !== 'image/png' || f.size > 10485760) throw new Error('Cada página debe ser PNG de hasta 10 MB.'); const bitmap = await createImageBitmap(f); bitmap.close(); }
      const ficha = creada || await api.crearHistorica(e); setCreada(ficha);
      // Guardar sube las páginas; publicar se pide de forma explícita.
      if (publicar) { await api.publicarPaginas(ficha, archivos); terminar(); }
    } catch (err) { setError(err.message); } finally { setOcupado(false); }
  };
  return <section className="card"><h3>Subir edición anterior</h3><fieldset disabled={ocupado || !!creada}>{[['numero','Número de edición'],['nombre','Título'],['periodo','Fecha o periodo'],['resumen','Resumen']].map(([campo, label]) => <label className="noticias-campo" key={campo}>{label}<input type={campo === 'numero' ? 'number' : 'text'} min="1" max={campo === 'numero' ? 9999 : undefined} maxLength={campo === 'periodo' ? 60 : campo === 'resumen' ? 1000 : 200} value={e[campo]} onChange={ev => setE({ ...e, [campo]: campo === 'numero' ? Number(ev.target.value) : ev.target.value })} /></label>)}</fieldset><label className="noticias-campo">Páginas PNG<input disabled={ocupado} type="file" multiple accept="image/png" onChange={ev => setArchivos([...ev.target.files].sort((a,b) => a.name.localeCompare(b.name, 'es', { numeric: true })))} /></label><p>Revisa el orden antes de publicar. La primera página será la portada.</p><ol>{archivos.map((f,i) => <li key={i}>{f.name} <button disabled={ocupado || !i} onClick={() => setArchivos(a => { const b = [...a]; [b[i-1],b[i]] = [b[i],b[i-1]]; return b; })}>↑ Subir página {i+1}</button><button disabled={ocupado || i === archivos.length-1} onClick={() => setArchivos(a => { const b = [...a]; [b[i+1],b[i]] = [b[i],b[i+1]]; return b; })}>↓ Bajar página {i+1}</button><button disabled={ocupado} onClick={() => setArchivos(a => a.filter((_,j) => i !== j))}>Quitar</button></li>)}</ol><button className="btn" disabled={ocupado} onClick={() => enviar(true)}>Publicar edición</button><button className="btn secundario" disabled={ocupado} onClick={terminar}>Volver</button>{error && <p role="alert">{error}</p>}</section>;
}
export default function BoletinReal({ administrar }) {
  const { persona } = useSesion(); const [params] = useSearchParams();
  const puedeEditar = !!persona?.editaComunicaciones || !!persona?.esAdmin;
  const editor = puedeEditar && (administrar || params.has('editor'));
  const [lista, setLista] = useState([]), [edicion, setEdicion] = useState(null), [historica, setHistorica] = useState(false), [cargando, setCargando] = useState(true), [error, setError] = useState(''), [ocupado, setOcupado] = useState(false);
  const recargar = async () => { setCargando(true); try { setLista(await api.catalogo()); setError(''); } catch(e) { setError(e.message); } finally { setCargando(false); } };
  useEffect(() => { recargar(); }, [persona?.id]);
  const accion = async fn => { setOcupado(true); setError(''); try { await fn(); await recargar(); } catch(e) { setError(e.message); } finally { setOcupado(false); } };
  if (edicion) return <BoletinEditor inicial={edicion} remoto salir={() => { setEdicion(null); recargar(); }} />;
  if (historica) return <Historica inicial={typeof historica === 'object' ? historica : null} lista={lista} terminar={() => { setHistorica(false); recargar(); }} />;
  if (params.has('edicion')) return <><Link className="volver" to="/noticias">← Catálogo de ediciones</Link><Lector key={params.get('edicion')} id={params.get('edicion')} /></>;
  const publicadas = lista.filter(e => e.estado === 'publicada');
  return <section className="noticias-boletin"><h2 className="noticias-masthead">EL JARA INFORMA</h2>{error && <><p role="alert">{error}</p><button className="btn secundario" onClick={recargar}>Reintentar</button></>}{cargando && <p role="status">Cargando ediciones…</p>}{puedeEditar && <Link className="btn secundario" to={editor ? '/noticias' : '/noticias?editor=1'}>{editor ? 'Ver catálogo' : 'Administrar ediciones'}</Link>}
  {editor ? <><div className="noticias-herramientas"><button className="btn" disabled={ocupado || cargando} onClick={() => setEdicion(edicionNueva(Math.max(0, ...lista.map(e => e.numero)) + 1))}>Crear nuevo boletín</button><button className="btn secundario" onClick={() => setHistorica(true)}>Subir edición anterior</button><label className="noticias-campo">Importar respaldo local<input type="file" accept="application/json,.json" disabled={ocupado} onChange={ev => { const archivo = ev.target.files[0]; ev.target.value = ''; if (archivo) accion(async () => { if (archivo.size > 150 * 1024 * 1024) throw new Error('El respaldo supera 150 MB.'); const e = validarEdicion(JSON.parse(await archivo.text())); e.id = crypto.randomUUID(); for (const b of e.bloques) for (const n of b.notas) for (const f of n.fotos) delete f.ruta; setEdicion(e); }); }} /></label></div>{lista.map(e => <article className="noticias-borrador" key={e.id}><h3>{e.titulo || `El Jara Informa N°${e.numero}`}</h3><p>{e.estado} · {e.fecha_edicion}</p><div className="noticias-herramientas">{e.origen === 'editor' && <button className="btn" disabled={ocupado} onClick={() => accion(async () => setEdicion(await api.contenidoEditable(await api.obtenerEdicion(e.id))))}>Continuar edición</button>}{e.estado === 'publicada' ? <button className="btn secundario" disabled={ocupado} onClick={() => accion(() => api.retirarEdicion(e.id))}>Retirar edición</button> : <>{e.origen === 'historica' && e.paginas === 0 && <button className="btn" disabled={ocupado} onClick={() => setHistorica(e)}>Subir páginas PNG</button>}{e.origen === 'historica' && e.paginas > 0 && <button className="btn" disabled={ocupado} onClick={() => accion(() => api.republicarHistorica(e))}>Volver a publicar</button>}<button className="btn secundario" disabled={ocupado} onClick={() => { const numero = prompt(`Para eliminar para siempre la edición, escribe su número (${e.numero}).`); if (numero !== null) accion(() => api.eliminarEdicion(e, numero)); }}>Eliminar edición</button></>}</div></article>)}</> : <>{!cargando && !error && !publicadas.length && <p>Aún no hay ediciones publicadas.</p>}{publicadas.length > 0 && <><h3>Última edición disponible</h3><TarjetaReal edicion={publicadas[0]} ultima /><h3>Historial de ediciones</h3>{publicadas.slice(1).map(e => <TarjetaReal key={e.id} edicion={e} />)}</>}</>}
  </section>;
}
