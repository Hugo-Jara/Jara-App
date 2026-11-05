import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSesion } from '../lib/sesion.jsx';
import { usePartidos, porEstado, sinResponder, tieneResultado, textoResultado, signo } from '../lib/partidos.js';
import { fechaLarga } from '../lib/fechas.js';
import Icono from '../components/Icono.jsx';
import Racha from '../components/Racha.jsx';

const MI_ESTADO = { voy: 'Vas', duda: 'En duda', baja: 'No vas' };

function Tarjeta({ p }) {
  return (
    <Link to={`/partidos/${p.id}`} className="card accion">
      <div className="sobretitulo">{p.equipo}{p.torneo ? ` · ${p.torneo}` : ''}</div>
      <h2 className="accion-titulo display">vs {p.rival}</h2>
      <p className="accion-dato">{fechaLarga(p.fecha)}{p.citacion ? ` · citación ${p.citacion}` : ''}{p.horaInicio ? ` · parte ${p.horaInicio}` : ''}</p>
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

const DE_A_POCOS = 5;
const POR_PLANTEL = 3;
// "28 oct"
const fechaMini = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }).replace('.', '');

// Con "Todos": una columna por plantel, con su racha y sus últimos partidos en
// filas cortas, una sección debajo de otra.
function ColumnaPlantel({ nombre, lista, verTodos }) {
  return (
    <section className="card plantel-jugados">
      <div className="plantel-jugados-cabeza">
        <h3 className="plantel-jugados-nombre">{nombre}</h3>
        <Racha jugados={lista} />
      </div>
      <ul className="jugados-cortos">
        {lista.slice(0, POR_PLANTEL).map((p) => (
          <li key={p.id}>
            <Link to={`/partidos/${p.id}`} className="jugado-corto">
              <span className="jugado-corto-fecha">{fechaMini(p.fecha)}</span>
              <span className="jugado-corto-rival">vs {p.rival}</span>
              {tieneResultado(p)
                ? <span className={`jugado-corto-marcador ${signo(p)}`}>{p.golesFavor}–{p.golesContra}</span>
                : <span className="jugado-corto-marcador sin">{p.puedoAnotar ? 'Anotar' : '—'}</span>}
            </Link>
          </li>
        ))}
      </ul>
      {lista.length > POR_PLANTEL && (
        <button type="button" className="enlace ver-todos" onClick={verTodos}>Ver todos los del {nombre} ({lista.length})</button>
      )}
    </section>
  );
}

export default function Partidos() {
  const { persona } = useSesion();
  const { cargando, error, partidos, mios, jugados } = usePartidos(persona);
  const otros = partidos.filter((p) => !p.esMio);

  // Ya jugados: se filtra por plantel y se muestran de a pocos. Si la persona está
  // en un solo plantel, parte filtrado en ese. (Más adelante: filtro por campeonato.)
  // Primero los planteles propios, después el resto por nombre.
  const mio = (id) => persona.equipos.some((e) => e.id === id);
  const planteles = [...new Map(jugados.map((p) => [p.equipoId, p.equipo])).entries()]
    .sort(([a, na], [b, nb]) => mio(b) - mio(a) || na.localeCompare(nb));
  const [elegido, setElegido] = useState(null);
  const [cuantos, setCuantos] = useState(DE_A_POCOS);
  const propio = persona.equipos.length === 1 && planteles.some(([id]) => id === persona.equipos[0].id)
    ? persona.equipos[0].id : '';
  const filtro = elegido ?? propio;
  const visibles = jugados.filter((p) => !filtro || p.equipoId === filtro);
  const elegir = (id) => { setElegido(id); setCuantos(DE_A_POCOS); };

  return (
    <>
      <h1 className="titulo display">Partidos</h1>
      <p className="subtitulo">Los que vienen y los que ya se jugaron. Respondes en los de tu plantel.</p>
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
          {planteles.length > 1 && (
            <div className="chips" style={{ marginTop: 0, marginBottom: 12 }}>
              <button type="button" className={`chip${!filtro ? ' activo' : ''}`} onClick={() => elegir('')}>Todos</button>
              {planteles.map(([id, nombre]) => (
                <button key={id} type="button" className={`chip${filtro === id ? ' activo' : ''}`} onClick={() => elegir(id)}>{nombre}</button>
              ))}
            </div>
          )}
          {!filtro && planteles.length > 1 ? (
            <div className="columnas-planteles">
              {planteles.map(([id, nombre]) => (
                <ColumnaPlantel key={id} nombre={nombre} lista={jugados.filter((p) => p.equipoId === id)} verTodos={() => elegir(id)} />
              ))}
            </div>
          ) : (
            <>
              {visibles.some(tieneResultado) && (
                <p className="racha-fila">Últimos resultados <Racha jugados={visibles} /></p>
              )}
              {visibles.slice(0, cuantos).map((p) => <TarjetaJugada key={p.id} p={p} />)}
            </>
          )}
          {(filtro || planteles.length <= 1) && visibles.length > cuantos && (
            <button type="button" className="btn secundario" onClick={() => setCuantos(cuantos + DE_A_POCOS)}>
              Ver más ({visibles.length - cuantos})
            </button>
          )}
        </>
      )}
    </>
  );
}
