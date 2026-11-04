import { useEffect, useState } from 'react';
import { useSesion } from '../lib/sesion.jsx';
import { leerMiApodo, guardarMiApodo } from '../lib/apodos.js';

// Más > Tu apodo. El nombre, el celular y el correo los pone tu tesorero; el
// apodo lo eliges tú y sale chico al lado de tu nombre en estadísticas y goles.
export default function MiApodo() {
  const { persona } = useSesion();
  const [apodo, setApodo] = useState('');
  const [guardado, setGuardado] = useState('');
  const [estado, setEstado] = useState({ ocupado: false, error: '', listo: '' });
  useEffect(() => { leerMiApodo().then((a) => { setApodo(a); setGuardado(a); }).catch(() => {}); }, []);
  const guardar = async (e) => {
    e.preventDefault();
    setEstado({ ocupado: true, error: '', listo: '' });
    try {
      await guardarMiApodo(persona.id, apodo);
      setGuardado(apodo.trim());
      setEstado({ ocupado: false, error: '', listo: apodo.trim() ? 'Listo, ya sale tu apodo.' : 'Quitaste tu apodo.' });
    } catch (err) { setEstado({ ocupado: false, error: err.message, listo: '' }); }
  };
  return (
    <form className="card" onSubmit={guardar}>
      <div className="item-que">Tu apodo</div>
      <p className="item-meta">Sale chico al lado de tu nombre en estadísticas y goleadores: {persona.nombre}{apodo.trim() && <span className="apodo"> · {apodo.trim()}</span>}</p>
      <div className="botones" style={{ marginTop: 10 }}>
        <input aria-label="Tu apodo" maxLength={20} placeholder="Ej: el Checho" value={apodo} onChange={(e) => setApodo(e.target.value)} />
        <button className="btn chico secundario" disabled={estado.ocupado || apodo.trim() === guardado}>Guardar</button>
      </div>
      {estado.error && <p className="error">{estado.error}</p>}
      {estado.listo && <p className="exito">{estado.listo}</p>}
    </form>
  );
}
