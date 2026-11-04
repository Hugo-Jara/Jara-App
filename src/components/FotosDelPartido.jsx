import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useEnlacesFotos } from '../lib/fotos.js';
import { idDeCarpeta, linkCarpeta } from '../lib/fotosDrive.js';

// Las fotos de un partido: por ahora, el enlace a su carpeta del Drive. La
// galería dentro de la app es del carril de Comunicaciones (Fase F) y usa
// fotosDeCarpeta() de src/lib/fotosDrive.js con el id que guarda este enlace.
export default function FotosDelPartido({ partido, jugado }) {
  const { dePartido, enlazar, desenlazar, cargando } = useEnlacesFotos();
  const [link, setLink] = useState('');
  const [estado, setEstado] = useState({ guardando: false, error: '' });
  const enlace = dePartido(partido.id);

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

  return (
    <div className="card">
      <div className="sobretitulo">Fotos</div>
      {enlace ? (
        <p className="sin-margen">
          <a className="enlace" href={linkCarpeta(enlace.carpetaId)} target="_blank" rel="noreferrer">
            Ver las fotos del partido{enlace.carpetaNombre ? ` (${enlace.carpetaNombre})` : ''}
          </a>
          {enlace.puedoCambiar && <> · <button className="enlace quitar" onClick={() => desenlazar(partido.id)}>Quitar</button></>}
        </p>
      ) : (
        <form onSubmit={guardar}>
          <label className="campo-etiqueta" htmlFor={`fp-${partido.id}`}>Pega el link de la carpeta del Drive con las fotos</label>
          <input id={`fp-${partido.id}`} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://drive.google.com/drive/folders/…" />
          {estado.error && <p className="error" role="alert">{estado.error}</p>}
          <button className="btn chico" style={{ marginTop: 10 }} disabled={!link.trim() || estado.guardando}>
            {estado.guardando ? 'Enlazando…' : 'Enlazar'}
          </button>
          <p className="nota" style={{ textAlign: 'left' }}>
            O búscala sola en <Link className="enlace" to="/fotos-partidos">Fotos de los partidos</Link>.
          </p>
        </form>
      )}
    </div>
  );
}
