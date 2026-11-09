import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSesion } from '../lib/sesion.jsx';
import { usePartidos, tablaEstadisticas, cifrasArquero, tieneResultado, signo } from '../lib/partidos.js';
import { conteoMvp } from '../lib/charla.js';
import { fechaCorta, hoyIso } from '../lib/fechas.js';

// La ficha de números del jugador en su perfil: partidos jugados, goles,
// asistencias, veces jugador del partido y tarjetas, este año o en total. Sale
// de lo mismo que la tabla de Jugadores (lo que se anota en cada partido), así
// así que sirve con lo que ya se anota. Si es arquero, suma además los goles
// recibidos y las vallas invictas de los partidos que jugó (0046).
const VACIA = { pj: 0, goles: 0, asistencias: 0, amarillas: 0, rojas: 0 };
const MARCA = { G: '✓', E: '=', P: '✗' };
const ULTIMOS = 5;

// Puesto del jugador en el club para una cifra (los empatados comparten puesto).
function puesto(lista, id, clave) {
  const mio = lista.find((g) => g.personaId === id)?.[clave] ?? 0;
  return mio > 0 ? lista.filter((g) => g[clave] > mio).length + 1 : null;
}
const ordinal = (n) => `${n}º`;
const promedio = (a, b) => (b ? (a / b).toFixed(2).replace('.', ',') : '0');

export default function EstadisticasJugador({ perfil }) {
  const { persona } = useSesion();
  const { jugados } = usePartidos(persona);
  const anioActual = Number(hoyIso().slice(0, 4));
  const [anio, setAnio] = useState(anioActual);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const planteles = perfil.planteles ?? [];
  const id = perfil.id;
  const esArquero = perfil.posicion === 'arquero';

  useEffect(() => {
    let vigente = true;
    setDatos(null); setError('');
    const a = anio || null;
    Promise.all([
      tablaEstadisticas([], a),
      conteoMvp([], a).catch(() => ({})),
      // Si juega en más de un plantel, sus números de cada uno.
      planteles.length > 1
        ? Promise.all(planteles.map((e) => tablaEstadisticas([e.id], a).then((l) => l.find((g) => g.personaId === id) ?? null)))
        : Promise.resolve([]),
      // Si la base todavía no tiene la 0046, simplemente no se muestra.
      esArquero ? cifrasArquero(id, a).catch(() => null) : Promise.resolve(null),
    ]).then(([club, mvps, porPlantel, arco]) => {
      if (!vigente) return;
      setDatos({
        club,
        yo: { ...VACIA, ...club.find((g) => g.personaId === id), mvp: mvps?.[id] ?? 0 },
        mvpPuesto: mvps?.[id] ? Object.values(mvps).filter((n) => n > mvps[id]).length + 1 : null,
        porPlantel: porPlantel.map((g, i) => ({ ...planteles[i], ...VACIA, ...g })).filter((g) => g.pj > 0),
        arco: arco?.pj ? arco : null,
      });
    }, (e) => vigente && setError(e.message));
    return () => { vigente = false; };
  }, [id, anio, esArquero]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sus últimos partidos con resultado (de los que la app tiene a mano).
  const ultimos = jugados
    .filter((p) => tieneResultado(p) && (!anio || p.fecha.startsWith(String(anio))))
    .filter((p) => (p.jugaron ?? []).includes(id) || p.estadisticas.some((g) => g.personaId === id))
    .slice(0, ULTIMOS);

  const yo = datos?.yo;
  const sinNada = yo && yo.pj === 0 && yo.mvp === 0;
  const notaPuesto = (clave) => {
    const n = datos && puesto(datos.club, id, clave);
    return n && n <= 10 ? `${ordinal(n)} del club` : null;
  };
  const cifras = yo ? [
    { etiqueta: 'Partidos', valor: yo.pj, nota: notaPuesto('pj') },
    { etiqueta: 'Goles', valor: yo.goles, nota: notaPuesto('goles') ?? (yo.pj ? `${promedio(yo.goles, yo.pj)} por partido` : null) },
    { etiqueta: 'Asistencias', valor: yo.asistencias, nota: notaPuesto('asistencias') },
    { etiqueta: 'Jugador del partido', valor: yo.mvp ? `★ ${yo.mvp}` : 0, nota: datos.mvpPuesto && datos.mvpPuesto <= 10 ? `${ordinal(datos.mvpPuesto)} del club` : null },
    ...(datos.arco ? [
      { etiqueta: 'Goles recibidos', valor: datos.arco.recibidos, nota: `${promedio(datos.arco.recibidos, datos.arco.pj)} por partido` },
      { etiqueta: 'Vallas invictas', valor: datos.arco.invictas, nota: `en ${datos.arco.pj} ${datos.arco.pj === 1 ? 'partido' : 'partidos'}` },
    ] : []),
  ] : [];

  return (
    <section className="card jugador-stats" aria-label="Estadísticas">
      <div className="jugador-stats-cabeza">
        <div className="item-que">Estadísticas</div>
        <div className="segmentos dos chicos" role="radiogroup" aria-label="Periodo">
          {[[anioActual, 'Este año'], [0, 'Histórico']].map(([valor, texto]) => (
            <button key={texto} role="radio" aria-checked={anio === valor} type="button"
                    className={`segmento ${anio === valor ? 'activo duda' : ''}`} onClick={() => setAnio(valor)}>{texto}</button>
          ))}
        </div>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {!datos && !error && <p className="vacio">Cargando…</p>}
      {sinNada && (
        <p className="vacio">
          {perfil.propio ? 'Todavía no tienes' : 'Todavía no tiene'} partidos anotados{anio ? ' este año' : ''}. Cuando se suban los resultados, acá aparecen sus números.
        </p>
      )}

      {yo && !sinNada && (
        <>
          <div className="kpis jugador-kpis">
            {cifras.map((c) => (
              <div key={c.etiqueta} className="kpi">
                <div className="kpi-etiqueta">{c.etiqueta}</div>
                <div className="kpi-valor">{c.valor}</div>
                {c.nota && <div className="kpi-nota">{c.nota}</div>}
              </div>
            ))}
          </div>
          <div className="jugador-tarjetas">
            <span><span className="tarjeta amarilla mini" /> {yo.amarillas} {yo.amarillas === 1 ? 'amarilla' : 'amarillas'}</span>
            <span><span className="tarjeta roja mini" /> {yo.rojas} {yo.rojas === 1 ? 'roja' : 'rojas'}</span>
          </div>
          {datos.arco && <p className="item-meta jugador-nota">Goles recibidos: los del equipo en los partidos que jugó, porque la app no anota quién estuvo al arco.</p>}

          {datos.porPlantel.length > 1 && (
            <>
              <div className="jugador-sub">Por plantel</div>
              <dl className="perfil-datos">
                {datos.porPlantel.map((g) => (
                  <div key={g.id}>
                    <dt>{g.nombre}</dt>
                    <dd className="cifras">
                      <span>{g.pj} <em>PJ</em></span><span>{g.goles} <em>goles</em></span><span>{g.asistencias} <em>asist.</em></span>
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          )}

          {ultimos.length > 0 && (
            <>
              <div className="jugador-sub">Últimos partidos</div>
              <ul className="jugador-ultimos">
                {ultimos.map((p) => {
                  const g = p.estadisticas.find((x) => x.personaId === id);
                  const aporte = [
                    g?.goles && `${g.goles} ${g.goles === 1 ? 'gol' : 'goles'}`,
                    g?.asistencias && `${g.asistencias} asist.`,
                    // Al arquero, lo que recibió en cada partido.
                    esArquero && (p.golesContra === 0 ? 'valla invicta' : `recibió ${p.golesContra}`),
                  ].filter(Boolean).join(' · ');
                  return (
                    <li key={p.id}>
                      <Link to={`/partidos/${p.id}`}>
                        <span className={`racha-marca ${signo(p)}`} aria-hidden="true">{MARCA[signo(p)]}</span>
                        <span className="jugador-partido">
                          <span>{p.golesFavor}–{p.golesContra} vs {p.rival}</span>
                          <span className="item-meta">{fechaCorta(p.fecha)}{planteles.length > 1 ? ` · ${p.equipo}` : ''}</span>
                        </span>
                        {aporte && <span className="jugador-aporte">{aporte}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </>
      )}
      <Link to="/jugadores" className="enlace jugador-ver-tabla">Ver la tabla del club ›</Link>
    </section>
  );
}
