import { useEffect, useState } from 'react';
import { useSesion } from '../lib/sesion.jsx';
import { usePartidos, tablaEstadisticas, equiposDelClub } from '../lib/partidos.js';
import NombreConApodo from '../components/NombreConApodo.jsx';
import { hoyIso } from '../lib/fechas.js';

// La tabla del club: partidos jugados, goles, asistencias y tarjetas de cada
// jugador, armada con lo que se anota en cada partido. Aparece todo el que jugó,
// aunque no haya hecho goles. Se ordena con los botones de arriba o tocando el
// título de una columna, y muestra los 10 primeros con "Ver todos".
const COLUMNAS = [
  { clave: 'pj', titulo: 'Partidos jugados', corto: 'PJ', boton: 'Partidos' },
  { clave: 'goles', titulo: 'Goles', corto: 'Goles', boton: 'Goles' },
  { clave: 'asistencias', titulo: 'Asistencias', corto: 'Asist.', boton: 'Asistencias' },
  { clave: 'amarillas', titulo: 'Amarillas', corto: <span className="tarjeta amarilla mini" />, boton: 'Amarillas' },
  { clave: 'rojas', titulo: 'Rojas', corto: <span className="tarjeta roja mini" />, boton: 'Rojas' },
];
const PRIMEROS = 10;

// Categorías: planteles que comparten la primera palabra ("Senior Sábado" y
// "Senior Jueves" son Senior). Solo se ofrece la categoría si junta dos o más.
function categorias(equipos) {
  const grupos = new Map();
  equipos.forEach((e) => {
    const cat = e.nombre.split(' ')[0];
    grupos.set(cat, [...(grupos.get(cat) ?? []), e.id]);
  });
  return [...grupos.entries()].filter(([, ids]) => ids.length > 1).map(([nombre, ids]) => ({ clave: `cat:${nombre}`, nombre, ids }));
}

export default function Estadisticas() {
  const { persona } = useSesion();
  const { todos, cargando: cargandoPartidos } = usePartidos(persona);
  const anioActual = Number(hoyIso().slice(0, 4));
  const [orden, setOrden] = useState('goles');
  const [equipos, setEquipos] = useState([]);
  const [filtro, setFiltro] = useState('');
  const [verTodos, setVerTodos] = useState(false);
  const [anio, setAnio] = useState(anioActual);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');

  // Cambia solo cuando cambia algún resultado: así la tabla se recarga después de anotar.
  const huella = todos.map((p) => `${p.id}:${p.golesFavor}:${(p.jugaron ?? []).join()}:${(p.estadisticas ?? []).map((g) => `${g.personaId}.${g.goles}.${g.asistencias}.${g.amarillas}.${g.rojas}`).join()}`).join('|');
  const cats = categorias(equipos);
  // Filtro: '' todo el club, 'cat:Senior' una categoría, o el id de un plantel.
  const idsFiltro = !filtro ? [] : cats.find((c) => c.clave === filtro)?.ids ?? [filtro];
  const claveIds = idsFiltro.join();

  // Los planteles del club, para filtrar.
  useEffect(() => { equiposDelClub().then(setEquipos, () => {}); }, []);

  useEffect(() => {
    let vigente = true;
    setError('');
    tablaEstadisticas(idsFiltro, anio || null).then(
      (l) => vigente && setDatos(l),
      (e) => vigente && setError(e.message),
    );
    return () => { vigente = false; };
  }, [claveIds, anio, huella]); // eslint-disable-line react-hooks/exhaustive-deps
  const filtrar = (f) => { setFiltro(f); setVerTodos(false); };
  const ordenar = (c) => { setOrden(c); setVerTodos(false); };

  // De más a menos por la columna elegida; si empatan, por las demás y por nombre. Los empatados comparten puesto.
  const lista = [...(datos ?? [])].sort((a, b) =>
    b[orden] - a[orden] || b.goles - a.goles || b.asistencias - a.asistencias || b.pj - a.pj || a.amarillas - b.amarillas || a.nombre.localeCompare(b.nombre));
  const puestos = [];
  lista.forEach((g, i) => { puestos[i] = i > 0 && lista[i - 1][orden] === g[orden] ? puestos[i - 1] : i + 1; });
  const hayAlgo = lista.some((g) => g[orden] > 0);
  const total = (clave) => lista.reduce((t, g) => t + g[clave], 0);
  const mostrados = verTodos ? lista : lista.slice(0, PRIMEROS);
  const yo = lista.findIndex((g) => g.personaId === persona.id);

  return (
    <>
      <h1 className="titulo display">Jugadores</h1>
      <p className="subtitulo">Partidos jugados, goles, asistencias y tarjetas de todo el club, con lo que se anota en cada partido.</p>
      <h2 className="seccion">Estadísticas</h2>

      <div className="segmentos dos" role="radiogroup" aria-label="Periodo">
        {[[anioActual, 'Este año'], [0, 'Histórico']].map(([valor, texto]) => (
          <button key={texto} role="radio" aria-checked={anio === valor} type="button"
                  className={`segmento ${anio === valor ? 'activo duda' : ''}`} onClick={() => setAnio(valor)}>{texto}</button>
        ))}
      </div>
      {equipos.length > 1 && (
        <div className="chips" role="radiogroup" aria-label="Plantel">
          {[{ id: '', nombre: 'Todo el club' }, ...cats.map((c) => ({ id: c.clave, nombre: `${c.nombre} (todos)` })), ...equipos].map((e) => (
            <button key={e.id} role="radio" aria-checked={filtro === e.id} type="button"
                    className={`chip ${filtro === e.id ? 'activo' : ''}`} onClick={() => filtrar(e.id)}>{e.nombre}</button>
          ))}
        </div>
      )}
      <div className="orden-fila" role="radiogroup" aria-label="Ordenar por">
        <span className="orden-titulo">Más</span>
        {COLUMNAS.map((c) => (
          <button key={c.clave} role="radio" aria-checked={orden === c.clave} type="button"
                  className={`chip chico ${orden === c.clave ? 'activo' : ''}`} onClick={() => ordenar(c.clave)}>{c.boton}</button>
        ))}
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {(datos === null && !error) || cargandoPartidos ? <p className="vacio suelto" style={{ marginTop: 14 }}>Cargando…</p> : null}
      {datos && lista.length === 0 && (
        <p className="vacio suelto" style={{ marginTop: 14 }}>
          Todavía no hay estadísticas anotadas{anio ? ' este año' : ''}. Cuando se suban los resultados de los partidos, acá aparece la tabla.
        </p>
      )}
      {datos && lista.length > 0 && (
        <div className="card tabla-club" role="table" aria-label="Estadísticas del club">
          <div className="fila-tabla cabeza" role="row">
            <span className="puesto" />
            <span className="quien" role="columnheader">Jugador</span>
            {COLUMNAS.map((c) => (
              <button key={c.clave} type="button" role="columnheader" aria-label={`Ordenar por ${c.titulo}`} aria-sort={orden === c.clave ? 'descending' : 'none'}
                      className={`col ${orden === c.clave ? 'activa' : ''}`} onClick={() => ordenar(c.clave)}>{c.corto}</button>
            ))}
          </div>
          {mostrados.map((g, i) => (
            <div key={g.personaId} role="row"
                 className={`fila-tabla ${hayAlgo && g[orden] > 0 && puestos[i] <= 3 && orden !== 'amarillas' && orden !== 'rojas' ? 'top' : ''} ${g.personaId === persona.id ? 'yo' : ''}`}>
              <span className="puesto">{g[orden] > 0 ? puestos[i] : ''}</span>
              <span className="quien"><NombreConApodo id={g.personaId} nombre={g.nombre} /></span>
              {COLUMNAS.map((c) => <span key={c.clave} className={`col ${orden === c.clave ? 'activa' : ''} ${g[c.clave] === 0 ? 'cero' : ''}`}>{g[c.clave]}</span>)}
            </div>
          ))}
          {!verTodos && yo >= PRIMEROS && (
            <div role="row" className="fila-tabla yo">
              <span className="puesto">{lista[yo][orden] > 0 ? puestos[yo] : ''}</span>
              <span className="quien"><NombreConApodo id={persona.id} nombre={lista[yo].nombre} /></span>
              {COLUMNAS.map((c) => <span key={c.clave} className={`col ${orden === c.clave ? 'activa' : ''} ${lista[yo][c.clave] === 0 ? 'cero' : ''}`}>{lista[yo][c.clave]}</span>)}
            </div>
          )}
          {lista.length > PRIMEROS && (
            <button type="button" className="enlace ver-todos" onClick={() => setVerTodos(!verTodos)}>
              {verTodos ? `Ver solo los ${PRIMEROS} primeros` : `Ver todos (${lista.length})`}
            </button>
          )}
          <div className="fila-tabla total" role="row">
            <span className="puesto" />
            <span className="quien">Total{lista.length > PRIMEROS ? ` (${lista.length})` : ''}</span>
            {COLUMNAS.map((c) => <span key={c.clave} className="col">{c.clave === 'pj' ? '' : total(c.clave)}</span>)}
          </div>
        </div>
      )}
    </>
  );
}
