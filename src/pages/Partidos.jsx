import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import FechasLiga from '../components/FechasLiga.jsx';
import { revisarLiga, actualizarLiga, useFechasLiga } from '../lib/liga.js';
import { useTablas } from '../lib/tabla.js';
import Tabla from './Tabla.jsx';
import { useSesion } from '../lib/sesion.jsx';
import { usePartidos, porEstado, sinResponder, tieneResultado, textoResultado, signo } from '../lib/partidos.js';
import { fechaLarga, cuando } from '../lib/fechas.js';
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

function NuestrosPartidos() {
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
      <p className="subtitulo">Los del Jara que vienen y los que ya se jugaron. Respondes en los de tu plantel.</p>
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

// "La liga": los partidos del Jara (con voy / no voy), las fechas de todo el
// campeonato y la tabla, en pestañas. La pestaña queda en el link (?v=fechas).
const PESTANAS = [
  { v: 'partidos', texto: 'Partidos' },
  { v: 'fechas', texto: 'Fechas' },
  { v: 'tabla', texto: 'Tabla' },
];

// Un solo botón trae todo de la liga: las fechas y las tablas conectadas.
// Lo puede apretar cualquiera; quien no anota partidos solo sale a la liga si
// pasaron 5 minutos desde la última revisión (0040). Las tablas de copafacil
// (jueves) llegan junto con las fechas; las de Deporstar se piden aparte.
function ActualizarLiga({ alTerminar }) {
  const { conectados } = useFechasLiga();
  const { tablas, refrescar, recargar: recargarTablas } = useTablas();
  const [trayendo, setTrayendo] = useState(false);
  const [error, setError] = useState('');
  const fechas = conectados.filter((c) => c.puedoActualizar);
  const tablasConectadas = tablas.filter((t) => t.deporstarTabla);
  // La última vez que alguien (o la app sola) revisó la liga, de cualquier
  // plantel: fechas o tablas.
  const ultima = [...conectados.map((c) => c.revisadaEn), ...tablas.filter((t) => t.conectada).map((t) => t.revisadaEn)]
    .filter(Boolean).sort().at(-1);
  const puede = fechas.length > 0 || tablasConectadas.length > 0;
  if (!puede && !ultima) return null;
  const traer = async () => {
    setTrayendo(true); setError('');
    const fallas = [];
    for (const c of fechas) {
      try { await actualizarLiga(c.equipoId); } catch (e) { fallas.push(e.message); }
    }
    for (const t of tablasConectadas) {
      try { await refrescar(t.equipoId, true, t.grupo); } catch (e) { fallas.push(e.message); }
    }
    await Promise.all([alTerminar?.(), recargarTablas()]);
    setError(fallas[0] ?? '');
    setTrayendo(false);
  };
  return (
    <>
      {puede && (
        <button type="button" className="btn secundario liga-actualizar" onClick={traer} disabled={trayendo}>
          {trayendo ? 'Actualizando…' : 'Actualizar la liga'}
        </button>
      )}
      {(error || ultima) && (
        <p className="ayuda liga-aviso" role="status">{error || `Última actualización: ${cuando(ultima)}`}</p>
      )}
    </>
  );
}

export default function LaLiga() {
  const { persona } = useSesion();
  const { recargar } = usePartidos(persona);
  const { recargar: recargarTablas } = useTablas();
  const [params, setParams] = useSearchParams();
  // Al entrar se revisa la liga (la base decide si ya toca); si llegan
  // partidos nuevos del Jara, aparecen en la pestaña Partidos (y las tablas
// del jueves, que vienen de copafacil junto con las fechas).
  useEffect(() => { revisarLiga(() => { recargar(); recargarTablas(); }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const v = PESTANAS.some((p) => p.v === params.get('v')) ? params.get('v') : 'partidos';
  return (
    <>
      <div className="liga-cabeza">
        <h1 className="titulo display">La liga</h1>
        <ActualizarLiga alTerminar={recargar} />
      </div>
      <div className="posiciones-pestanas liga-pestanas" role="tablist" aria-label="La liga">
        {PESTANAS.map((p) => (
          <button key={p.v} type="button" role="tab" aria-selected={p.v === v} className={p.v === v ? 'activa' : ''}
                  onClick={() => setParams(p.v === 'partidos' ? {} : { v: p.v }, { replace: true })}>{p.texto}</button>
        ))}
      </div>
      {v === 'partidos' && <NuestrosPartidos />}
      {v === 'fechas' && <FechasLiga />}
      {v === 'tabla' && <Tabla incrustada />}
    </>
  );
}
