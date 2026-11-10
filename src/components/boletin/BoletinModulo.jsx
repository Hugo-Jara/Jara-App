import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { esDemo } from '../../lib/supabase.js';
import { useSesion } from '../../lib/sesion.jsx';
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
  // En la app real, el editor lo abren Comunicaciones (permiso edita_comunicaciones,
  // también con "Ver como") y los administradores. Los borradores siguen siendo
  // locales: quedan en este aparato y no los ve nadie más.
  const { persona } = useSesion();
  const puedeEditar = esDemo || !!persona?.editaComunicaciones || !!persona?.esAdmin;
  const editor = (administrar || params.has('editor')) && puedeEditar;
  const demo = CATALOGO.find(e => e.id === params.get('edicion'));
  const recargar = async () => { setCargando(true); try { setBorradores((await listarBorradores()).sort((a, b) => b.modificada.localeCompare(a.modificada))); setError(''); } catch (e) { setError(`No pudimos abrir los borradores locales: ${e.message}`); } finally { setCargando(false); } };
  useEffect(() => { if (editor) recargar(); }, [editor]);
  const accion = async fn => { setOcupado(true); try { await fn(); setError(''); } catch (e) { setError(e.message); } finally { setOcupado(false); } };
  if (edicion) return <BoletinEditor key={edicion.id} inicial={edicion} salir={() => { setEdicion(null); recargar(); }} />;
  // Con la base real (producción) no se muestran las ediciones ficticias: los
  // socios ven el anuncio hasta que exista publicación oficial.
  if (!esDemo && !editor) return <section className="card"><h2 className="noticia-titulo">Se viene El Jara Informa</h2><p className="noticia-bajada">El boletín del club llega a la app para la fiesta de los 20 años. Acá vas a encontrar sus ediciones para leerlas a tu ritmo.</p>{puedeEditar && <Link className="btn secundario" to="/noticias?editor=1">Abrir el editor del boletín</Link>}{params.has('edicion') && <Link className="volver" to="/noticias">← Noticias</Link>}</section>;
  if (params.has('edicion')) return <><Link className="volver" to="/noticias">← Catálogo de ediciones</Link>{demo ? <BoletinVista edicion={demo} /> : <p role="alert">Esta edición no existe en el catálogo demostrativo.</p>}</>;
  if (editor) return <section className="noticias-boletin">
    <Link className="volver" to="/noticias">← Noticias</Link><p className="noticias-etiqueta">{esDemo ? 'COMUNICACIONES · DEMO LOCAL' : 'COMUNICACIONES · BORRADORES EN ESTE APARATO'}</p><h2>Mis borradores</h2>
    <>
      <p>Solo se guardan en este navegador. No se publican para los socios. Borrar el almacenamiento del navegador elimina también las fotografías; exporta respaldos.</p>
      <button className="btn" disabled={ocupado || cargando || !!error} onClick={() => accion(async () => { const lista = await listarBorradores(); const n = Math.max(...(esDemo ? CATALOGO.map(e => e.numero) : [0]), ...lista.map(e => e.numero)) + 1; const e = edicionNueva(n); await guardarBorrador(e); setEdicion(e); })}>Crear nuevo boletín</button>
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
    </>
  </section>;
  return <section className="noticias-boletin"><p className="noticias-etiqueta">TODOS JUEGAN · CATÁLOGO DEMOSTRATIVO</p><h2 className="noticias-masthead">EL JARA INFORMA</h2><p>El periódico del club, para leer a tu ritmo. Todas estas ediciones contienen información inventada.</p>
    {esDemo && <Link className="btn secundario" to="/noticias?editor=1">Administrar ediciones demo</Link>}
    <h3>Última edición disponible</h3><Tarjeta edicion={CATALOGO[0]} ultima /><h3>Historial de ediciones</h3>{CATALOGO.slice(1).map(e => <Tarjeta key={e.id} edicion={e} />)}
  </section>;
}
