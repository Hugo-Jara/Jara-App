import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSolicitudes } from '../lib/ingreso.js';

// Para encargados y administradores: quién pidió entrar y espera su pase.
function Solicitud({ s, resolver }) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const decidir = async (aprobar) => {
    setError(''); setOcupado(true);
    try { await resolver(s.id, aprobar); } catch (e) { setError(e.message); setOcupado(false); }
  };
  return (
    <li className="item">
      <div className="item-que">{s.nombre}</div>
      <div className="item-meta">
        {s.equipos.join(' · ') || 'Sin plantel'} · entró con {s.email}
      </div>
      {!s.enNomina && <p className="item-comentario">No estaba en la nómina: al aprobar se agrega como jugador nuevo.</p>}
      <div className="botones chicos">
        <button className="btn chico" disabled={ocupado} onClick={() => decidir(true)}>Es él, aprobar</button>
        <button className="btn chico secundario" disabled={ocupado} onClick={() => decidir(false)}>Rechazar</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </li>
  );
}

export default function Ingresos() {
  const { cargando, error, solicitudes, resolver } = useSolicitudes();
  return (
    <>
      <Link to="/mas" className="volver">‹ Más</Link>
      <h1 className="titulo display">Pases de ingreso</h1>
      <p className="subtitulo">
        Cada jugador elige su nombre al entrar. Aprueba solo si reconoces el correo o te avisó por otro lado: así nadie entra a nombre de otro.
      </p>
      {error && <p className="error" role="alert">{error}</p>}
      {cargando ? <p className="vacio suelto">Cargando…</p>
        : solicitudes.length === 0 ? <p className="vacio suelto">No hay nadie esperando.</p>
        : (
          <ul className="card lista items">
            {solicitudes.map((s) => <Solicitud key={s.id} s={s} resolver={resolver} />)}
          </ul>
        )}
    </>
  );
}
