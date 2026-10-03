import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSesion } from '../lib/sesion.jsx';
import { usePartidos, porEstado, sinResponder, recordatorioPartido } from '../lib/partidos.js';
import { fechaLarga } from '../lib/fechas.js';
import RecordarPorWhatsApp from '../components/RecordarPorWhatsApp.jsx';

const OPCIONES = [['voy', 'Voy'], ['duda', 'Duda'], ['baja', 'No voy']];
const TEXTO = { voy: 'Confirmaste que vas.', duda: 'Quedaste en duda.', baja: 'Avisaste que no vas.' };

function MiRespuesta({ partido, responder }) {
  const mia = partido.miRespuesta;
  const [estado, setEstado] = useState(mia?.estado ?? null);
  const [nota, setNota] = useState(mia?.nota ?? '');
  const [asado, setAsado] = useState(mia?.asado ?? true);
  const [editando, setEditando] = useState(!mia);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  if (!editando) {
    return (
      <p className="respuesta sin-margen" role="status">
        {TEXTO[mia.estado]} <button className="enlace" onClick={() => setEditando(true)}>Cambiar</button>
      </p>
    );
  }
  const guardar = async (e) => {
    e.preventDefault();
    setError(''); setGuardando(true);
    try {
      await responder(partido.id, { estado, nota: nota.trim() || undefined, asado: estado === 'voy' ? asado : false });
      setEditando(false);
    } catch (x) { setError(x.message); }
    setGuardando(false);
  };
  return (
    <form onSubmit={guardar}>
      <div className="segmentos" role="radiogroup" aria-label="¿Vas al partido?">
        {OPCIONES.map(([clave, texto]) => (
          <button type="button" key={clave} role="radio" aria-checked={estado === clave}
                  className={`segmento ${estado === clave ? `activo ${clave}` : ''}`}
                  onClick={() => { if (clave === 'voy' && estado !== 'voy') setAsado(true); setEstado(clave); }}>
            {texto}
          </button>
        ))}
      </div>
      {estado && (
        <>
          {estado === 'voy' && partido.tercerTiempo && (
            <label className="casilla">
              <input type="checkbox" checked={asado} onChange={(e) => setAsado(e.target.checked)} />
              Me quedo al tercer tiempo
            </label>
          )}
          <label htmlFor="nota">
            {estado === 'voy' ? 'Comentario (opcional): qué llevas, si llegas justo…' : 'Motivo (opcional)'}
          </label>
          <input id="nota" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={60} />
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn" style={{ marginTop: 14 }} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        </>
      )}
    </form>
  );
}

function Grupo({ titulo, clase, lista }) {
  if (!lista.length) return null;
  return (
    <section className="grupo">
      <h3 className={`grupo-titulo ${clase}`}>{titulo} <span>{lista.length}</span></h3>
      <ol className="nombres">
        {lista.map((r) => (
          <li key={r.personaId ?? r.id}>
            <span className="nombre">{r.nombre}</span>
            {r.asado && <span className="marca">tercer tiempo</span>}
            {r.nota && <span className="comentario">{r.nota}</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function Partido() {
  const { id } = useParams();
  const { persona } = useSesion();
  const { cargando, partidos, responder } = usePartidos(persona);
  const partido = partidos.find((p) => p.id === id);

  if (cargando) return <p className="vacio suelto">Cargando…</p>;
  if (!partido) {
    return (
      <>
        <Link to="/partidos" className="volver">‹ Partidos</Link>
        <p className="vacio suelto">Ese partido ya se jugó o lo quitaron del calendario.</p>
      </>
    );
  }
  const voy = porEstado(partido, 'voy');
  return (
    <>
      <Link to="/partidos" className="volver">‹ Partidos</Link>
      <div className="sobretitulo">{partido.equipo}{partido.torneo ? ` · ${partido.torneo}` : ''}</div>
      <h1 className="titulo display">vs {partido.rival}</h1>
      <dl className="datos">
        <div><dt>Día</dt><dd>{fechaLarga(partido.fecha)}</dd></div>
        {partido.citacion && <div><dt>Citación</dt><dd>{partido.citacion}</dd></div>}
        {partido.cancha && <div><dt>Cancha</dt><dd>{partido.cancha}</dd></div>}
        {partido.tercerTiempo && <div><dt>Tercer tiempo</dt><dd>{partido.tercerTiempo}</dd></div>}
      </dl>

      <div className="card">
        <div className="sobretitulo">¿Vas?</div>
        {partido.esMio
          ? <MiRespuesta key={partido.miRespuesta?.estado ?? 'sin'} partido={partido} responder={responder} />
          : <p className="vacio">Este partido es del {partido.equipo}. Responden los jugadores de ese plantel.</p>}
      </div>

      <div className="card">
        <Grupo titulo="Voy" clase="voy" lista={voy} />
        <Grupo titulo="Dudas" clase="duda" lista={porEstado(partido, 'duda')} />
        <Grupo titulo="Bajas" clase="baja" lista={porEstado(partido, 'baja')} />
        <Grupo titulo="Sin responder" clase="pendiente" lista={sinResponder(partido)} />
        {partido.plantel.length === 0 && voy.length === 0 && <p className="vacio">Este plantel todavía no tiene jugadores cargados.</p>}
        {partido.tercerTiempo && (
          <p className="conteo">{voy.filter((r) => r.asado).length} se quedan al tercer tiempo</p>
        )}
      </div>
      {partido.puedoEditar && (
        <>
          <RecordarPorWhatsApp mensaje={(url) => recordatorioPartido(partido, url)} />
          <Link to={`/partidos/${partido.id}/editar`} className="btn secundario" style={{ marginTop: 10 }}>Editar el partido</Link>
        </>
      )}
    </>
  );
}
