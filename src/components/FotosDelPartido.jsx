import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useEnlacesFotos, fotosDePartido } from '../lib/fotos.js';
import { idDeCarpeta, linkCarpeta, miniatura, miniaturaOtra, fotoEnDrive } from '../lib/fotosDrive.js';
import { plural } from '../lib/texto.js';

// En modo demostración no hay Drive: cuadros de colores en vez de fotos.
const demo = (id) => {
  const n = Number(id.split('-')[1] ?? 0);
  const color = ['#5b2a26', '#3d4a2a', '#2a3d4a', '#4a3d2a', '#3a2a4a'][n % 5];
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="${color}"/><text x="300" y="215" font-size="44" fill="#d9c89a" text-anchor="middle" font-family="sans-serif">Foto ${n + 1}</text></svg>`)}`;
};
export const fuente = (id, ancho) => (id.startsWith('demo-') ? demo(id) : miniatura(id, ancho));
// Si la miniatura del Drive falla, se prueba la otra dirección una vez.
export const otraVez = (id, ancho) => (e) => {
  if (id.startsWith('demo-') || e.currentTarget.dataset.otra) return;
  e.currentTarget.dataset.otra = '1';
  e.currentTarget.src = miniaturaOtra(id, ancho);
};

const PRIMERAS = 9;

// La foto grande, con anterior y siguiente.
export function Visor({ fotos, indice, cambiar, cerrar, extra }) {
  const foto = fotos[indice];
  useEffect(() => {
    const tecla = (e) => {
      if (e.key === 'Escape') cerrar();
      if (e.key === 'ArrowLeft' && indice > 0) cambiar(indice - 1);
      if (e.key === 'ArrowRight' && indice < fotos.length - 1) cambiar(indice + 1);
    };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [indice, fotos.length, cambiar, cerrar]);
  const [inicio, setInicio] = useState(null);
  const soltar = (e) => {
    if (inicio == null) return;
    const dx = e.changedTouches[0].clientX - inicio;
    if (dx > 50 && indice > 0) cambiar(indice - 1);
    if (dx < -50 && indice < fotos.length - 1) cambiar(indice + 1);
    setInicio(null);
  };
  return (
    <div className="visor" role="dialog" aria-modal="true" aria-label={`Foto ${indice + 1} de ${fotos.length}`}
         onTouchStart={(e) => setInicio(e.touches[0].clientX)} onTouchEnd={soltar}>
      <div className="visor-barra">
        <span>{indice + 1} / {fotos.length}</span>
        {!foto.id.startsWith('demo-') && <a className="enlace" href={fotoEnDrive(foto.id)} target="_blank" rel="noreferrer">Abrir en Drive</a>}
        <button className="visor-cerrar" onClick={cerrar} aria-label="Cerrar">✕</button>
      </div>
      <img key={foto.id} className="visor-foto" src={fuente(foto.id, 1600)} onError={otraVez(foto.id, 1600)} alt={foto.nombre ?? `Foto ${indice + 1}`} />
      <div className="visor-flechas">
        <button className="btn secundario chico" disabled={indice === 0} onClick={() => cambiar(indice - 1)}>‹ Anterior</button>
        {extra?.(foto)}
        <button className="btn secundario chico" disabled={indice === fotos.length - 1} onClick={() => cambiar(indice + 1)}>Siguiente ›</button>
      </div>
    </div>
  );
}

// Las fotos de un partido: galería con las fotos de su carpeta del Drive. Si no
// tiene carpeta, el capitán puede pegar el link.
export default function FotosDelPartido({ partido, jugado }) {
  const { dePartido, enlazar, desenlazar, cargando, vueltaEnSilencio } = useEnlacesFotos();
  const enlace = dePartido(partido.id);
  const [fotos, setFotos] = useState(null);
  const [todas, setTodas] = useState(false);
  const [abierta, setAbierta] = useState(null);
  const [link, setLink] = useState('');
  const [estado, setEstado] = useState({ guardando: false, error: '' });

  // ¿Llegaron fotos nuevas al Drive? La base decide si toca revisar.
  useEffect(() => { if (jugado) vueltaEnSilencio(); }, [jugado]);
  useEffect(() => {
    setFotos(null);
    if (enlace) fotosDePartido(partido.id).then(setFotos, () => setFotos([]));
  }, [partido.id, enlace?.carpetaId, enlace?.fotos]);

  if (cargando) return null;
  if (!enlace && !(jugado && partido.puedoEditar)) return null;

  const guardar = async (e) => {
    e.preventDefault();
    const id = idDeCarpeta(link);
    if (!id) { setEstado({ guardando: false, error: 'Ese link no parece una carpeta del Drive.' }); return; }
    setEstado({ guardando: true, error: '' });
    try { await enlazar(partido.id, id, null); setLink(''); setEstado({ guardando: false, error: '' }); }
    catch (x) { setEstado({ guardando: false, error: x.message }); }
  };

  if (!enlace) {
    return (
      <div className="card">
        <div className="sobretitulo">Fotos</div>
        <form onSubmit={guardar}>
          <label className="campo-etiqueta" htmlFor={`fp-${partido.id}`}>¿Ya están las fotos en el Drive? Pega el link de la carpeta</label>
          <input id={`fp-${partido.id}`} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://drive.google.com/drive/folders/…" />
          {estado.error && <p className="error" role="alert">{estado.error}</p>}
          <button className="btn chico" style={{ marginTop: 10 }} disabled={!link.trim() || estado.guardando}>
            {estado.guardando ? 'Enlazando…' : 'Enlazar'}
          </button>
          <p className="nota" style={{ textAlign: 'left' }}>
            La app las busca sola cuando la liga las sube. También puedes revisar en <Link className="enlace" to="/fotos-partidos">Fotos de los partidos</Link>.
          </p>
        </form>
      </div>
    );
  }

  const visibles = fotos ? (todas ? fotos : fotos.slice(0, PRIMERAS)) : [];
  return (
    <div className="card">
      <div className="sobretitulo">Fotos{fotos?.length ? ` · ${fotos.length}` : ''}</div>
      {fotos === null && <p className="vacio">Cargando fotos…</p>}
      {fotos?.length === 0 && <p className="vacio">La carpeta todavía no tiene fotos; la app vuelve a mirar en unas horas.</p>}
      {fotos?.length > 0 && (
        <div className="fotos-grilla">
          {visibles.map((f, i) => (
            <button key={f.id} className="fotos-miniatura" onClick={() => setAbierta(i)} aria-label={`Ver foto ${i + 1}`}>
              <img src={fuente(f.id, 400)} onError={otraVez(f.id, 400)} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
      {fotos?.length > PRIMERAS && !todas && (
        <button className="btn secundario" style={{ marginTop: 12 }} onClick={() => setTodas(true)}>Ver las {plural(fotos.length, 'foto', 'fotos')}</button>
      )}
      <p className="nota" style={{ textAlign: 'left' }}>
        Fotos del fotógrafo de la liga · <a className="enlace" href={linkCarpeta(enlace.carpetaId)} target="_blank" rel="noreferrer">Abrir la carpeta en Drive</a>
        {enlace.puedoCambiar && <> · <button className="enlace quitar" onClick={() => desenlazar(partido.id)}>No es este partido</button></>}
      </p>
      {abierta != null && fotos?.[abierta] && (
        <Visor fotos={fotos} indice={abierta} cambiar={setAbierta} cerrar={() => setAbierta(null)} />
      )}
    </div>
  );
}
