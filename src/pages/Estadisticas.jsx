import { useEffect, useState } from 'react';
import { useSesion } from '../lib/sesion.jsx';
import { usePartidos, tablaEstadisticas, equiposDelClub } from '../lib/partidos.js';
import { hoyIso } from '../lib/fechas.js';

// La tabla del club: goles, asistencias y tarjetas de cada jugador, armada con
// lo que se anota en cada partido. Tocando el título de una columna se ordena por ella.
const COLUMNAS = [
  { clave: 'goles', titulo: 'Goles', corto: 'Goles' },
  { clave: 'asistencias', titulo: 'Asistencias', corto: 'Asist.' },
  { clave: 'amarillas', titulo: 'Amarillas', corto: <span className="tarjeta amarilla mini" /> },
  { clave: 'rojas', titulo: 'Rojas', corto: <span className="tarjeta roja mini" /> },
];

export default function Estadisticas() {
  const { persona } = useSesion();
  const { todos, cargando: cargandoPartidos } = usePartidos(persona);
  const anioActual = Number(hoyIso().slice(0, 4));
  const [orden, setOrden] = useState('goles');
  const [equipos, setEquipos] = useState([]);
  const [equipoId, setEquipoId] = useState('');
  const [anio, setAnio] = useState(anioActual);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');

  // Cambia solo cuando cambia algún resultado: así la tabla se recarga después de anotar.
  const huella = todos.map((p) => `${p.id}:${p.golesFavor}:${(p.estadisticas ?? []).map((g) => `${g.personaId}.${g.goles}.${g.asistencias}.${g.amarillas}.${g.rojas}`).join()}`).join('|');

  // Los planteles del club, para filtrar.
  useEffect(() => { equiposDelClub().then(setEquipos, () => {}); }, []);

  useEffect(() => {
    let vigente = true;
    setError('');
    tablaEstadisticas(equipoId || null, anio || null).then(
      (l) => vigente && setDatos(l),
      (e) => vigente && setError(e.message),
    );
    return () => { vigente = false; };
  }, [equipoId, anio, huella]);

  // De más a menos por la columna elegida; si empatan, por las demás y por nombre. Los empatados comparten puesto.
  const lista = [...(datos ?? [])].sort((a, b) =>
    b[orden] - a[orden] || b.goles - a.goles || b.asistencias - a.asistencias || a.amarillas - b.amarillas || a.nombre.localeCompare(b.nombre));
  const puestos = [];
  lista.forEach((g, i) => { puestos[i] = i > 0 && lista[i - 1][orden] === g[orden] ? puestos[i - 1] : i + 1; });
  const hayAlgo = lista.some((g) => g[orden] > 0);
  const total = (clave) => lista.reduce((t, g) => t + g[clave], 0);

  return (
    <>
      <h1 className="titulo display">Jugadores</h1>
      <p className="subtitulo">Goles, asistencias y tarjetas de todo el club, con lo que se anota en cada partido.</p>
      <h2 className="seccion">Estadísticas</h2>

      <div className="segmentos dos" role="radiogroup" aria-label="Periodo">
        {[[anioActual, 'Este año'], [0, 'Histórico']].map(([valor, texto]) => (
          <button key={texto} role="radio" aria-checked={anio === valor} type="button"
                  className={`segmento ${anio === valor ? 'activo duda' : ''}`} onClick={() => setAnio(valor)}>{texto}</button>
        ))}
      </div>
      {equipos.length > 1 && (
        <div className="chips" role="radiogroup" aria-label="Plantel">
          {[{ id: '', nombre: 'Todo el club' }, ...equipos].map((e) => (
            <button key={e.id} role="radio" aria-checked={equipoId === e.id} type="button"
                    className={`chip ${equipoId === e.id ? 'activo' : ''}`} onClick={() => setEquipoId(e.id)}>{e.nombre}</button>
          ))}
        </div>
      )}

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
                      className={`col ${orden === c.clave ? 'activa' : ''}`} onClick={() => setOrden(c.clave)}>{c.corto}</button>
            ))}
          </div>
          {lista.map((g, i) => (
            <div key={g.personaId} role="row"
                 className={`fila-tabla ${hayAlgo && g[orden] > 0 && puestos[i] <= 3 && orden !== 'amarillas' && orden !== 'rojas' ? 'top' : ''} ${g.personaId === persona.id ? 'yo' : ''}`}>
              <span className="puesto">{g[orden] > 0 ? puestos[i] : ''}</span>
              <span className="quien">{g.nombre}</span>
              {COLUMNAS.map((c) => <span key={c.clave} className={`col ${orden === c.clave ? 'activa' : ''} ${g[c.clave] === 0 ? 'cero' : ''}`}>{g[c.clave]}</span>)}
            </div>
          ))}
          <div className="fila-tabla total" role="row">
            <span className="puesto" />
            <span className="quien">Total</span>
            {COLUMNAS.map((c) => <span key={c.clave} className="col">{total(c.clave)}</span>)}
          </div>
        </div>
      )}
    </>
  );
}
