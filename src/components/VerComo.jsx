import { useState } from 'react';
import { useSesion } from '../lib/sesion.jsx';
import { ROLES_PRUEBA, verComo } from '../lib/prueba.js';

// Tarjeta de Más, solo para cuentas de prueba: elige con qué rol ver la app.
export default function VerComo() {
  const { persona } = useSesion();
  const prueba = persona.prueba;
  const [plantel, setPlantel] = useState(prueba?.planteles?.[0]?.id ?? '');
  const [cambiando, setCambiando] = useState('');
  const [error, setError] = useState('');
  if (!prueba) return null;

  const elegir = async (rol) => {
    setCambiando(rol); setError('');
    try {
      await verComo(rol, rol === 'tesorero' ? plantel : null);
    } catch (e) {
      setError(e.message);
      setCambiando('');
    }
  };

  return (
    <div className="card ver-como">
      <div className="seccion" style={{ marginTop: 0 }}>Ver como</div>
      <p className="subtitulo" style={{ marginBottom: 12 }}>
        Cuenta de prueba. Elige con qué rol quieres ver la app; la app se recarga con ese rol.
      </p>
      {prueba.roles.map((rol) => {
        const r = ROLES_PRUEBA[rol];
        if (!r) return null;
        const actual = (prueba.rol ?? 'socio') === rol;
        return (
          <div key={rol} className="ver-como-fila">
            <button
              className={`btn ${actual ? '' : 'secundario'}`}
              disabled={!!cambiando || (rol === 'tesorero' && !plantel)}
              aria-pressed={actual}
              onClick={() => elegir(rol)}
            >
              {cambiando === rol ? 'Cambiando…' : r.nombre}
            </button>
            <div className="ver-como-desc">{actual ? `Ahora · ${r.desc}` : r.desc}</div>
            {rol === 'tesorero' && (
              <select value={plantel} onChange={(e) => setPlantel(e.target.value)} disabled={!!cambiando} aria-label="Plantel del tesorero">
                {prueba.planteles.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            )}
          </div>
        );
      })}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
