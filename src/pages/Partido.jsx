import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSesion } from '../lib/sesion.jsx';
import { usePartidos, porEstado, sinResponder, recordatorioPartido, tieneResultado, textoResultado } from '../lib/partidos.js';
import { fechaLarga, hoyIso } from '../lib/fechas.js';
import RecordarPorWhatsApp from '../components/RecordarPorWhatsApp.jsx';
import { complejoDe } from '../lib/complejos.js';
import EsquemaCanchas from '../components/EsquemaCanchas.jsx';

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

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

// Las cifras de cada jugador en el partido: goles, asistencias y tarjetas.
function Estadisticas({ partido }) {
  if (!partido.estadisticas?.length) return null;
  const sueltos = partido.golesFavor - partido.estadisticas.reduce((t, g) => t + g.goles, 0);
  return (
    <ul className="goleadores">
      {partido.estadisticas.map((g) => (
        <li key={g.personaId}>
          <span>{g.nombre}</span>
          <span className="cifras">
            {g.goles > 0 && <strong>{plural(g.goles, 'gol', 'goles')}</strong>}
            {g.asistencias > 0 && <em>{plural(g.asistencias, 'asistencia', 'asistencias')}</em>}
            {g.amarillas > 0 && <span className="tarjeta amarilla">{g.amarillas === 1 ? 'Amarilla' : '2 amarillas'}</span>}
            {g.rojas > 0 && <span className="tarjeta roja">Roja</span>}
          </span>
        </li>
      ))}
      {sueltos > 0 && <li className="suelto"><span>Goles sin asignar</span><strong>{sueltos}</strong></li>}
    </ul>
  );
}

const CAMPOS = [['goles', 'Goles', 99], ['asistencias', 'Asist.', 99], ['amarillas', 'Amarillas', 2], ['rojas', 'Rojas', 1]];

// Anotar o corregir el marcador y las cifras de cada jugador: solo quien anota
// los partidos del plantel, desde el día en que se juega.
function Resultado({ partido, anotar }) {
  const hay = tieneResultado(partido);
  const [editando, setEditando] = useState(false);
  const [favor, setFavor] = useState(partido.golesFavor ?? '');
  const [contra, setContra] = useState(partido.golesContra ?? '');
  const [filas, setFilas] = useState((partido.estadisticas ?? []).map((g) => ({ ...g })));
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const puede = partido.puedoAnotar && partido.fecha <= hoyIso();
  // Quienes pueden aparecer: el plantel, más quien ya estaba anotado.
  const opciones = [...partido.plantel, ...(partido.estadisticas ?? []).filter((g) => !partido.plantel.some((j) => j.id === g.personaId)).map((g) => ({ id: g.personaId, nombre: g.nombre }))];

  const cambiarFila = (i, campo, valor) => setFilas(filas.map((f, k) => (k === i ? { ...f, [campo]: valor } : f)));
  const num = (v) => Number(v || 0);
  const guardar = async (e) => {
    e.preventDefault();
    if (favor === '' || contra === '') return setError('Pon los goles de los dos equipos.');
    const elegidas = filas.filter((f) => f.personaId);
    if (new Set(elegidas.map((f) => f.personaId)).size !== elegidas.length) return setError('Un jugador está repetido.');
    const goles = elegidas.reduce((t, f) => t + num(f.goles), 0);
    const asist = elegidas.reduce((t, f) => t + num(f.asistencias), 0);
    if (goles > Number(favor)) return setError(`Los goles de los jugadores suman ${goles} y el marcador dice ${favor}.`);
    if (asist > Number(favor)) return setError(`Las asistencias suman ${asist} y el equipo hizo ${favor} goles.`);
    setError(''); setGuardando(true);
    try {
      await anotar(partido.id, Number(favor), Number(contra), elegidas.map((f) => ({
        personaId: f.personaId, goles: num(f.goles), asistencias: num(f.asistencias), amarillas: num(f.amarillas), rojas: num(f.rojas),
      })));
      setEditando(false);
    } catch (x) { setError(x.message); }
    setGuardando(false);
  };
  const quitar = async () => {
    setError(''); setGuardando(true);
    try { await anotar(partido.id, null, null, []); setFavor(''); setContra(''); setFilas([]); setEditando(false); }
    catch (x) { setError(x.message); }
    setGuardando(false);
  };

  if (!editando) {
    if (!hay && !puede) return null;
    return (
      <div className="card">
        <div className="sobretitulo">Resultado</div>
        {hay ? (
          <>
            <div className="marcador">
              <span className="marcador-goles display">{partido.golesFavor} – {partido.golesContra}</span>
              <span className="marcador-texto">{textoResultado(partido)} contra {partido.rival}</span>
            </div>
            <Estadisticas partido={partido} />
            {!partido.estadisticas.length && partido.golesFavor > 0 && <p className="ayuda abajo">Todavía no se anota quién hizo los goles.</p>}
          </>
        ) : <p className="vacio">Todavía no se anota el resultado.</p>}
        {puede && (
          <button className="btn secundario" style={{ marginTop: 14 }} onClick={() => setEditando(true)}>
            {hay ? 'Corregir resultado y estadísticas' : 'Poner resultado y estadísticas'}
          </button>
        )}
      </div>
    );
  }
  const asignados = filas.reduce((t, f) => t + num(f.goles), 0);
  return (
    <form className="card" onSubmit={guardar}>
      <div className="sobretitulo">Resultado</div>
      <label htmlFor="gf" style={{ marginTop: 0 }}>Goles del {partido.equipo}</label>
      <input id="gf" type="number" inputMode="numeric" min="0" max="99" required value={favor} onChange={(e) => setFavor(e.target.value)} />
      <label htmlFor="gc">Goles de {partido.rival}</label>
      <input id="gc" type="number" inputMode="numeric" min="0" max="99" required value={contra} onChange={(e) => setContra(e.target.value)} />

      <div className="sobretitulo" style={{ marginTop: 18 }}>Goles, asistencias y tarjetas</div>
      {filas.map((f, i) => (
        <div className="fila-jugador" key={i}>
          <div className="fila-jugador-cabeza">
            <select aria-label="Jugador" value={f.personaId} onChange={(e) => cambiarFila(i, 'personaId', e.target.value)}>
              <option value="">Elige…</option>
              {opciones.map((j) => <option key={j.id} value={j.id}>{j.nombre}</option>)}
            </select>
            <button type="button" className="enlace" aria-label="Quitar jugador" onClick={() => setFilas(filas.filter((_, k) => k !== i))}>Quitar</button>
          </div>
          <div className="cifras-campos">
            {CAMPOS.map(([campo, texto, max]) => (
              <label key={campo}>{texto}
                <input type="number" inputMode="numeric" min="0" max={max} aria-label={`${texto} de este jugador`}
                       value={f[campo] ?? 0} onChange={(e) => cambiarFila(i, campo, e.target.value)} />
              </label>
            ))}
          </div>
        </div>
      ))}
      <button type="button" className="btn secundario chico" style={{ marginTop: 10 }}
              onClick={() => setFilas([...filas, { personaId: '', goles: 0, asistencias: 0, amarillas: 0, rojas: 0 }])}>
        + Agregar jugador
      </button>
      {favor !== '' && <p className="ayuda abajo">Goles asignados: {asignados} de {favor}. Si falta alguno (autogol del rival, por ejemplo), queda como "sin asignar". Agrega solo a quienes tuvieron algo que anotar.</p>}

      {error && <p className="error" role="alert">{error}</p>}
      <div className="botones">
        <button className="btn" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        <button type="button" className="btn secundario" onClick={() => setEditando(false)}>Cancelar</button>
      </div>
      {hay && <p className="ayuda abajo"><button type="button" className="enlace" onClick={quitar}>Borrar el resultado</button></p>}
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
  const { cargando, error, recargar, todos, responder, anotarResultado } = usePartidos(persona);
  const partido = todos.find((p) => p.id === id);
  const jugado = partido ? partido.fecha < hoyIso() : false;

  if (cargando) return <p className="vacio suelto">Cargando…</p>;
  if (!partido && error) {
    return (
      <>
        <Link to="/partidos" className="volver">‹ Partidos</Link>
        <p className="error" role="alert">{error}</p>
        <button className="btn secundario" onClick={recargar}>Reintentar</button>
      </>
    );
  }
  if (!partido) {
    return (
      <>
        <Link to="/partidos" className="volver">‹ Partidos</Link>
        <p className="vacio suelto">No encontramos ese partido; puede que lo hayan quitado del calendario.</p>
      </>
    );
  }
  const voy = porEstado(partido, 'voy');
  const complejo = complejoDe(partido.equipo);
  return (
    <>
      <Link to="/partidos" className="volver">‹ Partidos</Link>
      <div className="sobretitulo">{partido.equipo}{partido.torneo ? ` · ${partido.torneo}` : ''}</div>
      <h1 className="titulo display">vs {partido.rival}</h1>
      <dl className="datos">
        <div><dt>Día</dt><dd>{fechaLarga(partido.fecha)}</dd></div>
        {partido.citacion && <div><dt>Citación</dt><dd>{partido.citacion}</dd></div>}
        {partido.horaInicio && <div><dt>Parte</dt><dd>{partido.horaInicio}</dd></div>}
        {partido.cancha && (
          <div><dt>Cancha</dt><dd>{complejo ? <EsquemaCanchas esquema={complejo.esquema} cancha={partido.cancha} /> : partido.cancha}</dd></div>
        )}
        {partido.tercerTiempo && <div><dt>Tercer tiempo</dt><dd>{partido.tercerTiempo}</dd></div>}
        {complejo && (
          <div style={{ gridColumn: '1 / -1' }}>
            <dt>Cómo llegar</dt>
            <dd>
              {complejo.waze && (
                <>
                  <a className="enlace" href={complejo.waze} target="_blank" rel="noreferrer">Waze</a>
                  {' · '}
                </>
              )}
              <a className="enlace" href={complejo.mapas} target="_blank" rel="noreferrer">Google Maps</a>
            </dd>
          </div>
        )}
      </dl>

      <Resultado key={`${partido.golesFavor}-${partido.golesContra}-${(partido.estadisticas ?? []).map((g) => `${g.personaId}.${g.goles}.${g.asistencias}.${g.amarillas}.${g.rojas}`).join()}`} partido={partido} anotar={anotarResultado} />

      {!jugado && (
        <div className="card">
          <div className="sobretitulo">¿Vas?</div>
          {partido.esMio
            ? <MiRespuesta key={partido.miRespuesta?.estado ?? 'sin'} partido={partido} responder={responder} />
            : <p className="vacio">Este partido es del {partido.equipo}. Responden los jugadores de ese plantel.</p>}
        </div>
      )}

      <div className="card">
        <Grupo titulo={jugado ? 'Dijeron que iban' : 'Voy'} clase="voy" lista={voy} />
        <Grupo titulo="Dudas" clase="duda" lista={porEstado(partido, 'duda')} />
        <Grupo titulo="Bajas" clase="baja" lista={porEstado(partido, 'baja')} />
        {!jugado && <Grupo titulo="Sin responder" clase="pendiente" lista={sinResponder(partido)} />}
        {partido.plantel.length === 0 && voy.length === 0 && <p className="vacio">Este plantel todavía no tiene jugadores cargados.</p>}
        {partido.tercerTiempo && (
          <p className="conteo">{voy.filter((r) => r.asado).length} se quedan al tercer tiempo</p>
        )}
      </div>
      {partido.puedoEditar && (
        <>
          {!jugado && <RecordarPorWhatsApp mensaje={(url) => recordatorioPartido(partido, url)} />}
          <Link to={`/partidos/${partido.id}/editar`} className="btn secundario" style={{ marginTop: 10 }}>Editar el partido</Link>
        </>
      )}
    </>
  );
}
