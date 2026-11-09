import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fotosDe } from '../lib/caras.js';
import { fuente, otraVez, Visor } from './FotosDelPartido.jsx';
import { fechaLarga } from '../lib/fechas.js';
import { plural } from '../lib/texto.js';

const PRIMERAS = 9;

// Perfil de otro jugador: las fotos de la liga donde sale, solo si él eligió
// mostrarlas (0045). Si no las muestra o no tiene, no aparece nada.
export default function FotosDelJugador({ personaId }) {
  const [fotos, setFotos] = useState(null);
  const [todas, setTodas] = useState(false);
  const [abierta, setAbierta] = useState(null);

  useEffect(() => {
    let vivo = true;
    setFotos(null); setTodas(false); setAbierta(null);
    fotosDe(personaId).then((f) => { if (vivo) setFotos(f); }).catch(() => { if (vivo) setFotos([]); });
    return () => { vivo = false; };
  }, [personaId]);

  if (!fotos?.length) return null;
  const visibles = todas ? fotos : fotos.slice(0, PRIMERAS);
  return (
    <div className="card perfil-fotos">
      <div className="item-que">En las fotos de la liga · {fotos.length}</div>
      <div className="fotos-grilla" style={{ marginTop: 12 }}>
        {visibles.map((f, i) => (
          <button key={f.id} className="fotos-miniatura" onClick={() => setAbierta(i)} aria-label={`Ver foto ${i + 1}`}>
            <img src={fuente(f.id, 400)} onError={otraVez(f.id, 400)} alt="" loading="lazy" />
          </button>
        ))}
      </div>
      {fotos.length > PRIMERAS && !todas && (
        <button className="btn secundario" style={{ marginTop: 12 }} onClick={() => setTodas(true)}>Ver las {plural(fotos.length, 'foto', 'fotos')}</button>
      )}
      {abierta != null && fotos[abierta] && (
        <Visor
          fotos={fotos} indice={abierta} cambiar={setAbierta} cerrar={() => setAbierta(null)}
          extra={(f) => (
            <span className="caras-visor-dato">
              {f.partidoId
                ? <Link className="enlace" to={`/partidos/${f.partidoId}`}>{f.equipo} vs {f.rival}{f.partidoFecha ? ` · ${fechaLarga(f.partidoFecha)}` : ''}</Link>
                : <span>{f.carpetaNombre}</span>}
            </span>
          )}
        />
      )}
    </div>
  );
}
