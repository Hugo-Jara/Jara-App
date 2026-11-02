import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { esDemo } from '../../lib/supabase.js';
import { CATALOGO, edicionNueva, idNuevo, nombreEdicion, validarEdicion } from '../../lib/boletinDatos.js';
import { listarBorradores, guardarBorrador, eliminarBorrador, respaldar } from '../../lib/boletinStorage.js';
import BoletinEditor from './BoletinEditor.jsx';
import BoletinVista, { useComposicion } from './BoletinVista.jsx';
function Tarjeta({ edicion, ultima }) {
  const { paginas, error, cargando } = useComposicion(edicion);
  return <article className="noticias-edicion-card">
    {paginas[0] && <img className="noticias-portada" src={paginas[0].toDataURL('image/png')} alt={`Portada de ${nombreEdicion(edicion)}`} />}
    <div>{ultima && <p className="noticias-etiqueta">ÚLTIMA EDICIÓN · DEMO</p>}<h3>{nombreEdicion(edicion)}</h3><p>{edicion.periodo}</p><p>{cargando ? 'Diagramando…' : error || `${paginas.length} páginas`}</p><Link className="btn" to={`/noticias?edicion=${edicion.id}`}>Leer edición</Link></div>
  </article>;
}
export default function BoletinModulo({ administrar = false }) {
  const [params, setParams] = useSearchParams();
  const [borradores, setBorradores] = useState([]), [edicion, setEdicion] = useState(null), [error, setError] = useState(''), [cargando, setCargando] = useState(true), [ocupado, setOcupado] = useState(false);
  const editor = administrar || params.has('editor');
  const demo = CATALOGO.find(e => e.id === params.get('edicion'));
  const recargar = async () => { setCargando(true); try { setBorradores((await listarBorradores()).sort((a, b) => b.modificada.localeCompare(a.modificada))); setError(''); } catch (e) { setError(`No pudimos abrir los borradores locales: ${e.message}`); } finally { setCargando(false); } };
  useEffect(() => { if (editor && esDemo) recargar(); }, [editor]);
  const accion = async fn => { setOcupado(true); try { await fn(); setError(''); } catch (e) { setError(e.message); } finally { setOcupado(false); } };
  if (edicion) return <BoletinEditor key={edicion.id} inicial={edicion} salir={() => { setEdicion(null); recargar(); }} />;
  if (params.has('edicion')) return <><Link className="volver" to="/noticias">← Catálogo de ediciones</Link>{demo ? <BoletinVista edicion={demo} /> : <p role="alert">Esta edición no existe en el catálogo demostrativo.</p>}</>;
  if (editor) return <section className="noticias-boletin">
    <Link className="volver" to="/noticias">← Noticias</Link><p className="noticias-etiqueta">COMUNICACIONES · DEMO LOCAL</p><h2>Mis borradores</h2>
    {!esDemo ? <p>El editor demostrativo está disponible sin conexión a la base. La publicación oficial se incorporará más adelante.</p> : <>
      <p>Solo se guardan en este navegador. No se publican para los socios. Borrar el almacenamiento del navegador elimina también las fotografías; exporta respaldos.</p>
      <button className="btn" disabled={ocupado || cargando || !!error} onClick={() => accion(async () => { const lista = await listarBorradores(); const n = Math.max(...CATALOGO.map(e => e.numero), ...lista.map(e => e.numero)) + 1; const e = edicionNueva(n); await guardarBorrador(e); setEdicion(e); })}>Crear nuevo boletín</button>
      <label className="noticias-campo">Importar respaldo local<input type="file" accept="application/json,.json" disabled={ocupado || cargando} onChange={ev => { const f = ev.target.files[0]; ev.target.value = ''; if (f) accion(async () => { if (f.size > 150 * 1024 * 1024) throw new Error('El respaldo supera 150 MB.'); const e = validarEdicion(JSON.parse(await f.text())); await guardarBorrador({ ...e, id: idNuevo(), modificada: new Date().toISOString() }); await recargar(); }); }} /></label>
      {cargando && <p role="status">Cargando borradores…</p>}
      {!cargando && !borradores.length && <p>No hay borradores todavía. Crea tu primera edición.</p>}
      {borradores.map(e => <article className="noticias-borrador" key={e.id}><h3>{nombreEdicion(e)}</h3><p>{e.periodo || 'Sin periodo'} · Última modificación: {new Date(e.modificada).toLocaleString('es-CL')}</p><div className="noticias-herramientas">
        <button className="btn" disabled={ocupado} onClick={() => setEdicion(e)}>Continuar edición</button>
        <button className="btn secundario" disabled={ocupado} onClick={() => accion(async () => { await guardarBorrador({ ...e, id: idNuevo(), nombre: `${nombreEdicion(e)} (copia)`, modificada: new Date().toISOString() }); await recargar(); })}>Duplicar</button>
        <button className="btn secundario" onClick={() => respaldar(e)}>Respaldar</button>
        <button className="btn secundario" disabled={ocupado} onClick={() => { if (confirm(`¿Eliminar el borrador «${nombreEdicion(e)}» y sus fotografías?`)) accion(async () => { await eliminarBorrador(e.id); await recargar(); }); }}>Eliminar borrador</button>
      </div></article>)}
      {error && <><p className="noticias-error" role="alert">{error}</p><button className="btn secundario" onClick={recargar}>Reintentar almacenamiento</button></>}
    </>}
  </section>;
  return <section className="noticias-boletin"><p className="noticias-etiqueta">TODOS JUEGAN · CATÁLOGO DEMOSTRATIVO</p><h2 className="noticias-masthead">EL JARA INFORMA</h2><p>El periódico del club, para leer a tu ritmo. Todas estas ediciones contienen información inventada.</p>
    {esDemo && <Link className="btn secundario" to="/noticias?editor=1">Administrar ediciones demo</Link>}
    <h3>Última edición disponible</h3><Tarjeta edicion={CATALOGO[0]} ultima /><h3>Historial de ediciones</h3>{CATALOGO.slice(1).map(e => <Tarjeta key={e.id} edicion={e} />)}
  </section>;
}
