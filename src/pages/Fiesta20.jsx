import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import SubirFiesta from '../components/SubirFiesta.jsx';
import { useFiesta, fiestaVisible, urlGrande, urlDescarga, borrar, megas } from '../lib/fiesta.js';
import { plural } from '../lib/texto.js';

const POR_PAGINA = 30;

// La foto o el video grande, con anterior y siguiente.
function Visor({ archivos, indice, cambiar, cerrar, alBorrar }) {
  const a = archivos[indice];
  const [url, setUrl] = useState(null);
  const [ocupado, setOcupado] = useState('');
  const [inicio, setInicio] = useState(null);
  useEffect(() => {
    let vivo = true;
    setUrl(null);
    urlGrande(a).then((u) => vivo && setUrl(u), () => vivo && setUrl(''));
    return () => { vivo = false; };
  }, [a.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const tecla = (e) => {
      if (e.key === 'Escape') cerrar();
      if (e.key === 'ArrowLeft' && indice > 0) cambiar(indice - 1);
      if (e.key === 'ArrowRight' && indice < archivos.length - 1) cambiar(indice + 1);
    };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [indice, archivos.length, cambiar, cerrar]);
  const soltar = (e) => {
    if (inicio == null || a.tipo === 'video') return;
    const dx = e.changedTouches[0].clientX - inicio;
    if (dx > 50 && indice > 0) cambiar(indice - 1);
    if (dx < -50 && indice < archivos.length - 1) cambiar(indice + 1);
    setInicio(null);
  };
  const descargar = async () => {
    setOcupado('descargando');
    try { const u = await urlDescarga(a); if (u) window.location.href = u; } finally { setOcupado(''); }
  };
  const quitar = async () => {
    if (!window.confirm(a.tipo === 'video' ? '¿Borrar este video de la galería?' : '¿Borrar esta foto de la galería?')) return;
    setOcupado('borrando');
    try { await borrar(a); alBorrar(); } catch (x) { setOcupado(''); window.alert(x.message); }
  };
  return (
    <div className="visor" role="dialog" aria-modal="true" aria-label={`${indice + 1} de ${archivos.length}`}
         onTouchStart={(e) => setInicio(e.touches[0].clientX)} onTouchEnd={soltar}>
      <div className="visor-barra">
        <span>{indice + 1} / {archivos.length} · {a.nombre}</span>
        <button className="visor-cerrar" onClick={cerrar} aria-label="Cerrar">✕</button>
      </div>
      {url === null && <p className="vacio fiesta-cargando">Cargando…</p>}
      {url === '' && <p className="error">No pudimos abrirlo. Revisa tu señal.</p>}
      {url && (a.tipo === 'video'
        ? <video key={a.id} className="visor-foto" src={url} controls playsInline autoPlay poster={a.urlMini ?? undefined} />
        : <img key={a.id} className="visor-foto" src={url} alt={`Foto de ${a.nombre}`} />)}
      <div className="visor-acciones">
        <button className="btn secundario chico" disabled={!!ocupado} onClick={descargar}>{ocupado === 'descargando' ? 'Preparando…' : 'Guardar'}</button>
        {a.puedo_borrar && <button className="btn secundario chico" disabled={!!ocupado} onClick={quitar}>{ocupado === 'borrando' ? 'Borrando…' : 'Borrar'}</button>}
      </div>
      <div className="visor-flechas">
        <button className="btn secundario chico" disabled={indice === 0} onClick={() => cambiar(indice - 1)}>‹ Anterior</button>
        <button className="btn secundario chico" disabled={indice === archivos.length - 1} onClick={() => cambiar(indice + 1)}>Siguiente ›</button>
      </div>
    </div>
  );
}

export function Miniatura({ a, abrir }) {
  return (
    <button className="fotos-miniatura fiesta-mini" onClick={abrir} aria-label={a.tipo === 'video' ? `Ver video de ${a.nombre}` : `Ver foto de ${a.nombre}`}>
      {a.urlMini ? <img src={a.urlMini} alt="" loading="lazy" /> : <span className="fiesta-sin-mini">Video</span>}
      {a.tipo === 'video' && <span className="fiesta-play" aria-hidden="true">▶</span>}
    </button>
  );
}

export default function Fiesta20() {
  const { cargando, error, datos, recargar } = useFiesta();
  const [abierta, setAbierta] = useState(null);
  const [filtro, setFiltro] = useState('todo');
  const [cuantas, setCuantas] = useState(POR_PAGINA);
  if (!fiestaVisible()) return <Navigate to="/" replace />;

  const todos = datos?.archivos ?? [];
  const lista = filtro === 'todo' ? todos : todos.filter((a) => a.tipo === filtro);
  const fotos = todos.filter((a) => a.tipo === 'foto').length;
  const videos = todos.length - fotos;
  const lleno = datos && datos.usado >= datos.tope * 0.97;

  return (
    <>
      <p><Link to="/" className="enlace">‹ Inicio</Link></p>
      <h1 className="titulo display">El carrete de los 20 años</h1>
      <p className="subtitulo">Las fotos y videos que sube la gente del Jara. Sube los tuyos: puedes elegir varios a la vez.</p>

      <section className="card">
        {lleno
          ? <p className="error" style={{ textAlign: 'left', marginTop: 0 }}>Se llenó el espacio de la galería. Avísale a un administrador.</p>
          : <SubirFiesta listo={recargar} />}
        <p className="nota" style={{ textAlign: 'left' }}>
          Las fotos se achican solas para que suban rápido. Videos de hasta 50 MB: un video corto del celular, o uno que ya pasó por WhatsApp.
          Solo las ve la gente del club con sesión.
        </p>
      </section>

      {error && !datos && (
        <section className="card"><p className="error" role="alert">{error}</p><button className="btn chico secundario" onClick={recargar}>Reintentar</button></section>
      )}
      {cargando && <p className="vacio suelto">Cargando la galería…</p>}
      {datos && (
        <section className="card">
          <div className="titulo-fila">
            <div className="sobretitulo" style={{ margin: 0 }}>
              {todos.length ? `${plural(fotos, 'foto', 'fotos')} · ${plural(videos, 'video', 'videos')}` : 'Galería'}
            </div>
            <button className="enlace" onClick={recargar}>Actualizar</button>
          </div>
          {todos.length > 0 && videos > 0 && fotos > 0 && (
            <div className="filtros" role="group" aria-label="Mostrar" style={{ marginBottom: 0 }}>
              {[['todo', 'Todo'], ['foto', 'Fotos'], ['video', 'Videos']].map(([k, t]) => (
                <button key={k} className={`filtro${filtro === k ? ' activo' : ''}`} aria-pressed={filtro === k}
                        onClick={() => { setFiltro(k); setCuantas(POR_PAGINA); }}>{t}</button>
              ))}
            </div>
          )}
          {todos.length === 0
            ? <p className="vacio">Todavía no hay nada. ¡Sé el primero en subir algo!</p>
            : (
              <div className="fotos-grilla">
                {lista.slice(0, cuantas).map((a, i) => <Miniatura key={a.id} a={a} abrir={() => setAbierta(i)} />)}
              </div>
            )}
          {lista.length > cuantas && (
            <button className="btn secundario" style={{ marginTop: 12 }} onClick={() => setCuantas((n) => n + POR_PAGINA)}>
              Ver más ({lista.length - cuantas})
            </button>
          )}
          {datos.tope > 0 && <p className="nota" style={{ textAlign: 'left' }}>Espacio usado: {megas(datos.usado)} de {megas(datos.tope)}.</p>}
        </section>
      )}

      {abierta != null && lista[abierta] && (
        <Visor archivos={lista} indice={abierta} cambiar={setAbierta} cerrar={() => setAbierta(null)}
               alBorrar={() => { setAbierta(null); recargar(); }} />
      )}
    </>
  );
}
