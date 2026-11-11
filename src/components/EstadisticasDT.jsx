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
const MARCA = { G: '✓', E: '=', P: '✗' };
const ULTIMOS = 5;

export default function EstadisticasDT({ perfil }) {
  const { persona } = useSesion();
  const { jugados } = usePartidos(persona);
  const anioActual = Number(hoyIso().slice(0, 4));
  const [anio, setAnio] = useState(anioActual);
  const [d, setD] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let vigente = true;
    setD(null); setError('');
    cifrasDT(perfil.id, anio || null).then((x) => vigente && setD(x), (e) => vigente && setError(e.message));
    return () => { vigente = false; };
  }, [perfil.id, anio]);

  // Rendimiento: puntos ganados sobre los posibles (3 por partido).
  const rendimiento = d?.pj ? Math.round(((d.g * 3 + d.e) / (d.pj * 3)) * 100) : 0;
  const mios = new Set(d?.partidos ?? []);
  const ultimos = jugados.filter((p) => mios.has(p.id)).slice(0, ULTIMOS);
  const varios = (d?.por_plantel?.length ?? 0) > 1;

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

      {error && <p className="error" role="alert">{error}</p>}
      {!d && !error && <p className="vacio">Cargando…</p>}
      {d && d.pj === 0 && (
        <p className="vacio">
          {perfil.propio ? 'Todavía no tienes' : 'Todavía no tiene'} partidos dirigidos anotados{anio ? ' este año' : ''}. Cuando se suban los resultados de su plantel, acá aparece su récord.
        </p>
      )}

      {d && d.pj > 0 && (
        <>
          <div className="kpis jugador-kpis">
            <div className="kpi">
              <div className="kpi-etiqueta">Partidos dirigidos</div>
              <div className="kpi-valor">{d.pj}</div>
              <div className="kpi-nota">{d.g} G · {d.e} E · {d.p} P</div>
            </div>
            <div className="kpi">
              <div className="kpi-etiqueta">Rendimiento</div>
              <div className="kpi-valor">{rendimiento}%</div>
              <div className="kpi-nota">{d.g * 3 + d.e} de {d.pj * 3} puntos</div>
            </div>
            <div className="kpi">
              <div className="kpi-etiqueta">Goles</div>
              <div className="kpi-valor">{d.gf}–{d.gc}</div>
              <div className="kpi-nota">a favor y en contra</div>
            </div>
            <div className="kpi">
              <div className="kpi-etiqueta">Vallas invictas</div>
              <div className="kpi-valor">{d.invictas}</div>
              <div className="kpi-nota">en {d.pj} {d.pj === 1 ? 'partido' : 'partidos'}</div>
            </div>
          </div>

          {(d.goleador || d.mvp) && (
            <dl className="perfil-datos">
              {d.goleador && (
                <div><dt>Goleador</dt><dd><NombreConApodo id={d.goleador.persona_id} nombre={d.goleador.nombre} enlace /> · {d.goleador.goles} {d.goleador.goles === 1 ? 'gol' : 'goles'}</dd></div>
              )}
              {d.mvp && (
                <div><dt>Más veces jugador del partido</dt><dd><NombreConApodo id={d.mvp.persona_id} nombre={d.mvp.nombre} enlace /> · ★ {d.mvp.veces}</dd></div>
              )}
            </dl>
          )}

          {varios && (
            <>
              <div className="jugador-sub">Por plantel</div>
              <dl className="perfil-datos">
                {d.por_plantel.map((e) => (
                  <div key={e.id}>
                    <dt>{e.nombre}</dt>
                    <dd className="cifras"><span>{e.pj} <em>PJ</em></span><span>{e.g} <em>G</em></span><span>{e.e} <em>E</em></span><span>{e.p} <em>P</em></span></dd>
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
                        <span className="item-meta">{fechaCorta(p.fecha)}{varios ? ` · ${p.equipo}` : ''}</span>
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
