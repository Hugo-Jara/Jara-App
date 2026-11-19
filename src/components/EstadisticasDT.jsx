import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSesion } from '../lib/sesion.jsx';
import { usePartidos, cifrasDT, signo } from '../lib/partidos.js';
import { fechaCorta, hoyIso } from '../lib/fechas.js';
import NombreConApodo from './NombreConApodo.jsx';

// La ficha de números del DT o ayudante técnico en su perfil (0048): partidos
// dirigidos, récord G/E/P y rendimiento, goles a favor y en contra, vallas
// invictas, su récord en cada plantel, los últimos resultados, y el goleador y
// el jugador del partido más repetido en sus partidos.
//
// Si dirige más de un plantel, arriba elige la vista: Juntos o un plantel
// (ej. Jueves y Sábado), para comparar cómo va cada equipo. Sin migración: el
// récord G/E/P por plantel viene de dt_cifras (exacto), y los goles, vallas,
// goleador y últimos partidos de ese plantel se sacan de los partidos jugados
// que ya trae la app. Si alguno de sus partidos no está en esa lista (la base
// manda los últimos 30 del club), se muestra solo lo exacto y se avisa.
const MARCA = { G: '✓', E: '=', P: '✗' };
const ULTIMOS = 5;

export default function EstadisticasDT({ perfil }) {
  const { persona } = useSesion();
  const { jugados } = usePartidos(persona);
  const anioActual = Number(hoyIso().slice(0, 4));
  const [anio, setAnio] = useState(anioActual);
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const [vista, setVista] = useState('juntos');

  useEffect(() => {
    let vigente = true;
    setD(null); setError('');
    cifrasDT(perfil.id, anio || null).then((x) => vigente && setD(x), (e) => vigente && setError(e.message));
    return () => { vigente = false; };
  }, [perfil.id, anio]);

  const mios = new Set(d?.partidos ?? []);
  const misJugados = jugados.filter((p) => mios.has(p.id));
  const planteles = d?.por_plantel ?? [];
  const varios = planteles.length > 1;
  const plantel = varios ? planteles.find((e) => e.id === vista) ?? null : null;
  const v = plantel ? cifrasPlantel(plantel, misJugados) : d;
  const ultimos = (plantel ? misJugados.filter((p) => p.equipoId === plantel.id) : misJugados).slice(0, ULTIMOS);
  const etiquetas = nombresCortos(planteles);

  return (
    <section className="card jugador-stats" aria-label="Como DT">
      <div className="jugador-stats-cabeza">
        <div className="item-que">Como DT</div>
        <div className="segmentos dos chicos" role="radiogroup" aria-label="Periodo">
          {[[anioActual, 'Este año'], [0, 'Histórico']].map(([valor, texto]) => (
            <button key={texto} role="radio" aria-checked={anio === valor} type="button"
                    className={`segmento ${anio === valor ? 'activo duda' : ''}`} onClick={() => setAnio(valor)}>{texto}</button>
          ))}
        </div>
      </div>

      {varios && (
        <div className={`segmentos chicos ${planteles.length === 2 ? '' : 'cuatro'} dt-vista`} role="radiogroup" aria-label="Plantel">
          {[['juntos', 'Juntos'], ...planteles.map((e) => [e.id, etiquetas[e.id]])].map(([valor, texto]) => (
            <button key={valor} role="radio" aria-checked={(plantel?.id ?? 'juntos') === valor} type="button"
                    className={`segmento ${(plantel?.id ?? 'juntos') === valor ? 'activo duda' : ''}`} onClick={() => setVista(valor)}>{texto}</button>
          ))}
        </div>
      )}

      {error && <p className="error" role="alert">{error}</p>}
      {!d && !error && <p className="vacio">Cargando…</p>}
      {d && d.pj === 0 && (
        <p className="vacio">
          {perfil.propio ? 'Todavía no tienes' : 'Todavía no tiene'} partidos dirigidos anotados{anio ? ' este año' : ''}. Cuando se suban los resultados de su plantel, acá aparece su récord.
        </p>
      )}

      {d && d.pj > 0 && v && (
        <>
          <div className="kpis jugador-kpis">
            <div className="kpi">
              <div className="kpi-etiqueta">Partidos dirigidos</div>
              <div className="kpi-valor">{v.pj}</div>
              <div className="kpi-nota">{v.g} G · {v.e} E · {v.p} P</div>
            </div>
            <div className="kpi">
              <div className="kpi-etiqueta">Rendimiento</div>
              <div className="kpi-valor">{rendimiento(v)}%</div>
              <div className="kpi-nota">{v.g * 3 + v.e} de {v.pj * 3} puntos</div>
            </div>
            {v.gf != null && (
              <>
                <div className="kpi">
                  <div className="kpi-etiqueta">Goles</div>
                  <div className="kpi-valor">{v.gf}–{v.gc}</div>
                  <div className="kpi-nota">a favor y en contra</div>
                </div>
                <div className="kpi">
                  <div className="kpi-etiqueta">Vallas invictas</div>
                  <div className="kpi-valor">{v.invictas}</div>
                  <div className="kpi-nota">en {v.pj} {v.pj === 1 ? 'partido' : 'partidos'}</div>
                </div>
              </>
            )}
          </div>
          {v.gf == null && (
            <p className="item-meta">Los goles, vallas y goleador de este plantel salen solo con los partidos más recientes. Mira «Juntos» para el total.</p>
          )}

          {(v.goleador || v.mvp) && (
            <dl className="perfil-datos">
              {v.goleador && (
                <div><dt>Goleador</dt><dd><NombreConApodo id={v.goleador.persona_id} nombre={v.goleador.nombre} enlace /> · {v.goleador.goles} {v.goleador.goles === 1 ? 'gol' : 'goles'}</dd></div>
              )}
              {v.mvp && (
                <div><dt>Más veces jugador del partido</dt><dd><NombreConApodo id={v.mvp.persona_id} nombre={v.mvp.nombre} enlace /> · ★ {v.mvp.veces}</dd></div>
              )}
            </dl>
          )}

          {varios && !plantel && (
            <>
              <div className="jugador-sub">Por plantel</div>
              <dl className="perfil-datos">
                {planteles.map((e) => (
                  <div key={e.id}>
                    <dt>{e.nombre}</dt>
                    <dd className="cifras"><span>{e.pj} <em>PJ</em></span><span>{e.g} <em>G</em></span><span>{e.e} <em>E</em></span><span>{e.p} <em>P</em></span><span>{rendimiento(e)}<em>%</em></span></dd>
                  </div>
                ))}
              </dl>
            </>
          )}

          {ultimos.length > 0 && (
            <>
              <div className="jugador-sub">Últimos partidos</div>
              <ul className="jugador-ultimos">
                {ultimos.map((p) => (
                  <li key={p.id}>
                    <Link to={`/partidos/${p.id}`}>
                      <span className={`racha-marca ${signo(p)}`} aria-hidden="true">{MARCA[signo(p)]}</span>
                      <span className="jugador-partido">
                        <span>{p.golesFavor}–{p.golesContra} vs {p.rival}</span>
                        <span className="item-meta">{fechaCorta(p.fecha)}{varios && !plantel ? ` · ${p.equipo}` : ''}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}

// Rendimiento: puntos ganados sobre los posibles (3 por partido).
const rendimiento = (x) => (x.pj ? Math.round(((x.g * 3 + x.e) / (x.pj * 3)) * 100) : 0);

// Las cifras de un plantel. PJ y G/E/P vienen exactos de la base; goles,
// vallas y goleador se calculan con sus partidos jugados, solo si están todos.
// El jugador del partido más repetido se ve en «Juntos».
function cifrasPlantel(fila, misJugados) {
  const ps = misJugados.filter((p) => p.equipoId === fila.id);
  if (ps.length !== fila.pj) return { ...fila, gf: null, goleador: null, mvp: null };
  const goles = {};
  ps.forEach((p) => p.estadisticas.forEach((g) => {
    if (g.goles) goles[g.personaId] = { persona_id: g.personaId, nombre: g.nombre, goles: (goles[g.personaId]?.goles ?? 0) + g.goles };
  }));
  const goleador = Object.values(goles).sort((a, b) => b.goles - a.goles || a.nombre.localeCompare(b.nombre))[0] ?? null;
  return {
    ...fila,
    gf: ps.reduce((t, p) => t + p.golesFavor, 0),
    gc: ps.reduce((t, p) => t + p.golesContra, 0),
    invictas: ps.filter((p) => p.golesContra === 0).length,
    goleador, mvp: null,
  };
}

// "Senior Jueves" y "Senior Sábado" quedan "Jueves" y "Sábado": se sacan las
// palabras que se repiten en todos, para que quepan en el selector.
function nombresCortos(planteles) {
  const palabras = planteles.map((e) => e.nombre.split(' '));
  const comunes = new Set(palabras[0]?.filter((w) => palabras.every((ws) => ws.includes(w))) ?? []);
  return Object.fromEntries(planteles.map((e, i) => {
    const corto = palabras[i].filter((w) => !comunes.has(w)).join(' ');
    return [e.id, corto || e.nombre];
  }));
}
