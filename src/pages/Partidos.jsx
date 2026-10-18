import { Link } from 'react-router-dom';
import { useSesion } from '../lib/sesion.jsx';
import { usePartidos, porEstado, sinResponder, tieneResultado, textoResultado } from '../lib/partidos.js';
import { fechaLarga } from '../lib/fechas.js';
import Icono from '../components/Icono.jsx';

const MI_ESTADO = { voy: 'Vas', duda: 'En duda', baja: 'No vas' };

function Tarjeta({ p }) {
  return (
    <Link to={`/partidos/${p.id}`} className="card accion">
      <div className="sobretitulo">{p.equipo}{p.torneo ? ` · ${p.torneo}` : ''}</div>
      <h2 className="accion-titulo display">vs {p.rival}</h2>
      <p className="accion-dato">{fechaLarga(p.fecha)}{p.citacion ? ` · citación ${p.citacion}` : ''}</p>
      <p className="conteo">
        {p.esMio && (
          <span className={`estado ${p.miRespuesta ? p.miRespuesta.estado : 'pendiente'}`}>
            {p.miRespuesta ? MI_ESTADO[p.miRespuesta.estado] : 'Te falta responder'}
          </span>
        )}
        {p.esMio && ' · '}
        {porEstado(p, 'voy').length} van, {porEstado(p, 'duda').length} en duda, {sinResponder(p).length} sin responder
      </p>
      <span className="ver-mas">Ver la lista <Icono nombre="flecha" size={16} /></span>
    </Link>
  );
}

function TarjetaJugada({ p }) {
  return (
    <Link to={`/partidos/${p.id}`} className="card accion">
      <div className="sobretitulo">{p.equipo} · {fechaLarga(p.fecha)}</div>
      {tieneResultado(p) ? (
        <div className="marcador">
          <span className="marcador-goles display">{p.golesFavor} – {p.golesContra}</span>
          <span className="marcador-texto">{textoResultado(p)} contra {p.rival}</span>
        </div>
      ) : (
        <>
          <h2 className="accion-titulo display">vs {p.rival}</h2>
          <p className="accion-dato">{p.puedoAnotar ? 'Falta anotar el resultado.' : 'Todavía no se anota el resultado.'}</p>
        </>
      )}
      <span className="ver-mas">
        {!tieneResultado(p) && p.puedoAnotar ? 'Poner el resultado' : 'Ver el partido'} <Icono nombre="flecha" size={16} />
      </span>
    </Link>
  );
}

export default function Partidos() {
  const { persona } = useSesion();
  const { cargando, error, partidos, mios, jugados } = usePartidos(persona);
  const otros = partidos.filter((p) => !p.esMio);

  return (
    <>
      <h1 className="titulo display">Partidos</h1>
      <p className="subtitulo">Los que vienen y los que ya se jugaron. Respondes en los de tu plantel.</p>
      <Link to="/estadisticas" className="card accion"><div className="sobretitulo">Estadísticas del club</div><p className="accion-dato">Goleadores, asistentes y tarjetas</p><span className="ver-mas">Ver las tablas <Icono nombre="flecha" size={16} /></span></Link>
      {persona.esEncargado && <Link to="/partidos/nuevo" className="btn secundario" style={{ marginBottom: 14 }}>Programar un partido</Link>}
      {error && <p className="error" role="alert">{error}</p>}
      {cargando ? <p className="vacio suelto">Cargando…</p> : (
        <>
          {mios.length === 0 && (
            <p className="vacio suelto">
              {persona.equipos.length ? 'Todavía no hay un partido programado para tu plantel.' : 'No estás en ningún plantel.'}
            </p>
          )}
          {mios.map((p) => <Tarjeta key={p.id} p={p} />)}
          {otros.length > 0 && <h2 className="seccion">Otros planteles</h2>}
          {otros.map((p) => <Tarjeta key={p.id} p={p} />)}
          {jugados.length > 0 && <h2 className="seccion">Ya jugados</h2>}
          {jugados.map((p) => <TarjetaJugada key={p.id} p={p} />)}
        </>
      )}
    </>
  );
}
