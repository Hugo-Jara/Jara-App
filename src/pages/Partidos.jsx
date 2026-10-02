import { useState } from 'react';
import { useSesion } from '../lib/sesion.jsx';
import { useListas, porEstado, sinResponder, recordatorioPartido } from '../lib/listas.js';
import RecordarPorWhatsApp from '../components/RecordarPorWhatsApp.jsx';

const OPCIONES = [['voy', 'Voy'], ['duda', 'Duda'], ['baja', 'No voy']];

function MiRespuesta({ partido, miRespuesta, responder }) {
  const [estado, setEstado] = useState(miRespuesta?.estado ?? null);
  const [nota, setNota] = useState(miRespuesta?.nota ?? '');
  const [asado, setAsado] = useState(miRespuesta?.asado ?? true);
  const [editando, setEditando] = useState(!miRespuesta);

  if (!editando) {
    const texto = { voy: 'Confirmaste que vas.', duda: 'Quedaste en duda.', baja: 'Avisaste que no vas.' }[miRespuesta.estado];
    return (
      <p className="respuesta" role="status">
        {texto} <button className="enlace" onClick={() => setEditando(true)}>Cambiar</button>
      </p>
    );
  }
  const guardar = (e) => {
    e.preventDefault();
    responder({ estado, nota: nota.trim() || undefined, asado: estado === 'voy' ? asado : false });
    setEditando(false);
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
          <button className="btn" style={{ marginTop: 14 }}>Guardar</button>
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
          <li key={r.nombre}>
            <span className="nombre">{r.nombre}</span>
            {r.asado && <span className="marca">tercer tiempo</span>}
            {r.nota && <span className="comentario">{r.nota}</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function Partidos() {
  const { persona } = useSesion();
  const yo = persona.nombre.split(' ')[0];
  const { partido, miRespuesta, responder } = useListas(yo);

  if (!partido) {
    return (
      <>
        <h1 className="titulo display">Partidos</h1>
        <p className="vacio suelto">Todavía no hay un partido programado para tu equipo.</p>
      </>
    );
  }
  const voy = porEstado(partido, 'voy');
  return (
    <>
      <div className="sobretitulo">{partido.equipo} · {partido.torneo}</div>
      <h1 className="titulo display">vs {partido.rival}</h1>
      <dl className="datos">
        <div><dt>Día</dt><dd>{partido.fecha}</dd></div>
        <div><dt>Citación</dt><dd>{partido.citacion}</dd></div>
        <div><dt>Cancha</dt><dd>{partido.cancha}</dd></div>
        {partido.tercerTiempo && <div><dt>Tercer tiempo</dt><dd>{partido.tercerTiempo}</dd></div>}
      </dl>

      <div className="card">
        <div className="sobretitulo">¿Vas?</div>
        <MiRespuesta key={miRespuesta?.estado ?? 'sin'} partido={partido} miRespuesta={miRespuesta} responder={responder} />
      </div>

      <div className="card">
        <Grupo titulo="Voy" clase="voy" lista={voy} />
        <Grupo titulo="Dudas" clase="duda" lista={porEstado(partido, 'duda')} />
        <Grupo titulo="Bajas" clase="baja" lista={porEstado(partido, 'baja')} />
        <Grupo titulo="Sin responder" clase="pendiente" lista={sinResponder(partido).map((nombre) => ({ nombre }))} />
        {partido.tercerTiempo && (
          <p className="conteo">{voy.filter((r) => r.asado).length} se quedan al tercer tiempo</p>
        )}
      </div>
      <RecordarPorWhatsApp mensaje={(url) => recordatorioPartido(partido, url)} />
    </>
  );
}
