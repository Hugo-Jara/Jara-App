import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSesion } from '../lib/sesion.jsx';
import { usePartidos } from '../lib/partidos.js';
import { useTablas, diferencia, leerTabla, textoDeTabla, leerFixture, crearPartidoSuelto } from '../lib/tabla.js';
import { leerCaptura } from '../lib/captura.js';
import { fechaLarga, fechaCorta, hoyIso } from '../lib/fechas.js';
import Icono from '../components/Icono.jsx';

// "Cómo vamos": la tabla de cada plantel y sus próximas fechas. El encargado
// copia la tabla de la página de la liga (o sube un pantallazo) y puede cargar
// todas las fechas del campeonato de una vez. Un plantel puede tener varias
// tablas (ej. "Grupo A" y "General"), que se ven con pestañas (0036).

const conSigno = (n) => (n > 0 ? `+${n}` : String(n));

function TablaPosiciones({ filas }) {
  return (
    <div className="card posiciones" role="table" aria-label="Tabla de posiciones">
      <div className="posiciones-fila cabeza" role="row">
        <span className="posiciones-puesto" role="columnheader">#</span>
        <span className="posiciones-equipo" role="columnheader">Equipo</span>
        <span className="posiciones-col" role="columnheader" title="Partidos jugados">PJ</span>
        <span className="posiciones-col" role="columnheader" title="Ganados">G</span>
        <span className="posiciones-col" role="columnheader" title="Empatados">E</span>
        <span className="posiciones-col" role="columnheader" title="Perdidos">P</span>
        <span className="posiciones-col ancho" role="columnheader" title="Goles a favor">GF</span>
        <span className="posiciones-col ancho" role="columnheader" title="Goles en contra">GC</span>
        <span className="posiciones-col" role="columnheader" title="Diferencia de gol">DG</span>
        <span className="posiciones-col pts" role="columnheader" title="Puntos">Pts</span>
      </div>
      {filas.map((f, i) => (
        <div key={`${i}-${f.equipo}`} role="row" className={`posiciones-fila ${f.esJara ? 'jara' : ''}`}>
          <span className="posiciones-puesto">{i + 1}</span>
          <span className="posiciones-equipo">{f.equipo}</span>
          <span className="posiciones-col">{f.pj}</span>
          <span className="posiciones-col">{f.pg}</span>
          <span className="posiciones-col">{f.pe}</span>
          <span className="posiciones-col">{f.pp}</span>
          <span className="posiciones-col ancho">{f.gf}</span>
          <span className="posiciones-col ancho">{f.gc}</span>
          <span className="posiciones-col">{conSigno(diferencia(f))}</span>
          <span className="posiciones-col pts">{f.pts}</span>
        </div>
      ))}
    </div>
  );
}

// nueva: se está agregando otra pestaña al plantel. otras: los nombres de las
// demás pestañas. conocidos: nombres de equipos ya cargados (para corregir lo
// que se lea mal del pantallazo).
function EditarTabla({ tabla, nueva, otras, conocidos, guardar, borrar, conectar, refrescar, cerrar }) {
  const base = nueva ? { ...tabla, grupo: '', filas: [], deporstarTabla: null, fuente: '' } : tabla;
  const [texto, setTexto] = useState(textoDeTabla(base.filas));
  const [grupo, setGrupo] = useState(base.grupo);
  const [numero, setNumero] = useState(base.deporstarTabla ? String(base.deporstarTabla) : '');
  const [torneo, setTorneo] = useState(base.torneo ?? '');
  const [fuente, setFuente] = useState(base.fuente ?? '');
  const [ocupado, setOcupado] = useState(false);
  const [leyendo, setLeyendo] = useState(null); // avance de 0 a 1 mientras lee el pantallazo
  const [avisos, setAvisos] = useState([]);
  const [error, setError] = useState('');
  const archivo = useRef(null);
  const { filas, problemas } = leerTabla(texto);
  const numeroLimpio = numero.trim();
  const numeroMalo = numeroLimpio !== '' && !/^\d{1,8}$/.test(numeroLimpio);
  const cambiaNumero = !numeroMalo && numeroLimpio !== (base.deporstarTabla ? String(base.deporstarTabla) : '');
  const grupoLimpio = grupo.trim().slice(0, 30);
  const conPestanas = nueva || otras.length > 0 || base.grupo !== '';
  const grupoMalo = conPestanas && (!grupoLimpio || otras.some((o) => o.toLowerCase() === grupoLimpio.toLowerCase()));

  const leer = async (e) => {
    const img = e.target.files?.[0];
    e.target.value = '';
    if (!img) return;
    setLeyendo(0); setError(''); setAvisos([]);
    try {
      const r = await leerCaptura(img, conocidos, setLeyendo);
      if (!r.filas.length) {
        setError('No se encontró una tabla en la imagen. Prueba con un pantallazo más nítido, solo de la tabla.');
        return;
      }
      setTexto(textoDeTabla(r.filas));
      setAvisos(r.avisos);
      if (r.grupo && conPestanas && !grupoLimpio) setGrupo(r.grupo);
    } catch (err) {
      setError(`No se pudo leer el pantallazo (${err.message}). Revisa la conexión e intenta de nuevo.`);
    } finally { setLeyendo(null); }
  };

  const enviar = async (e) => {
    e.preventDefault();
    if (problemas.length || grupoMalo || (!filas.length && !cambiaNumero)) return;
    setOcupado(true); setError('');
    const g = conPestanas ? grupoLimpio : '';
    try {
      if (filas.length) await guardar(tabla.equipoId, torneo.trim(), filas, fuente.trim(), g, nueva ? null : base.grupo);
      if (cambiaNumero) {
        await conectar(tabla.equipoId, numeroLimpio ? Number(numeroLimpio) : null, g);
        if (numeroLimpio) await refrescar(tabla.equipoId, true, g);
      }
      cerrar(g);
    } catch (err) { setError(err.message); setOcupado(false); }
  };

  const quitar = async () => {
    if (!window.confirm(`¿Borrar la tabla "${base.grupo || 'Tabla'}" de ${tabla.equipo}?`)) return;
    setOcupado(true); setError('');
    try { await borrar(tabla.equipoId, base.grupo); cerrar(null); }
    catch (err) { setError(err.message); setOcupado(false); }
  };

  return (
    <form className="card" onSubmit={enviar}>
      <h2 className="posiciones-form-titulo">{nueva ? 'Otra tabla' : 'Actualizar la tabla'} · {tabla.equipo}</h2>
      {conPestanas && (
        <>
          <label htmlFor="tb-grupo">Nombre de la pestaña</label>
          <input id="tb-grupo" value={grupo} maxLength={30} onChange={(e) => setGrupo(e.target.value)} placeholder="Ej.: Grupo A o General" />
          {grupoMalo && <p className="error">{grupoLimpio ? 'Ya hay una pestaña con ese nombre.' : 'Ponle un nombre a la pestaña.'}</p>}
        </>
      )}
      <div className="posiciones-captura">
        <input ref={archivo} type="file" accept="image/*" hidden onChange={leer} />
        <button type="button" className="btn secundario" onClick={() => archivo.current?.click()} disabled={ocupado || leyendo != null}>
          {leyendo != null ? `Leyendo el pantallazo… ${Math.round(leyendo * 100)}%` : 'Subir un pantallazo de la tabla'}
        </button>
        <p className="ayuda abajo">
          La app lee la imagen y llena la tabla de abajo. Revísala antes de guardar: a veces confunde un número o un nombre.
        </p>
      </div>
      {avisos.map((a) => <p key={a} className="aviso-captura">{a}</p>)}
      <label htmlFor="tb-torneo">Campeonato (opcional)</label>
      <input id="tb-torneo" value={torneo} maxLength={80} onChange={(e) => setTorneo(e.target.value)} placeholder="Ej.: Clausura 2026" />
      <label htmlFor="tb-texto">La tabla, una línea por equipo</label>
      <p className="ayuda">En orden: equipo, PJ, G, E, P, GF, GC y puntos. Ej.: <em>Hugo Jara 9 6 2 1 20 8 20</em>. Se puede copiar de la página de la liga.</p>
      <textarea id="tb-texto" rows={10} value={texto} onChange={(e) => setTexto(e.target.value)} spellCheck={false}
                placeholder={'Rival Uno 9 7 1 1 22 9 22\nHugo Jara 9 6 2 1 20 8 20\n…'} />
      {problemas.map((p) => <p key={p} className="error">{p}</p>)}
      {filas.length > 0 && !problemas.length && (
        <>
          <p className="ayuda abajo">Así va a quedar{filas.some((f) => f.esJara) ? ' (el Jara destacado)' : ''}:</p>
          <TablaPosiciones filas={filas} />
        </>
      )}
      <label htmlFor="tb-fuente">Link a la página de la liga (opcional)</label>
      <input id="tb-fuente" type="url" value={fuente} onChange={(e) => setFuente(e.target.value)} placeholder="https://…" />
      <label htmlFor="tb-deporstar">Número de la tabla en Deporstar (opcional)</label>
      <input id="tb-deporstar" inputMode="numeric" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Ej.: 71290" />
      <p className="ayuda abajo">
        Si la liga publica la tabla en Deporstar, con este número la app la trae sola. Déjalo vacío para cargarla a mano.
      </p>
      {numeroMalo && <p className="error">El número de Deporstar son solo dígitos.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="botones">
        <button className="btn" disabled={ocupado || numeroMalo || problemas.length > 0 || (!filas.length && !cambiaNumero)}>{ocupado ? 'Guardando…' : 'Guardar la tabla'}</button>
        <button type="button" className="btn secundario" onClick={() => cerrar(undefined)} disabled={ocupado}>Cancelar</button>
      </div>
      {!nueva && otras.length > 0 && (
        <button type="button" className="btn secundario posiciones-borrar" style={{ marginTop: 12 }} onClick={quitar} disabled={ocupado}>Borrar esta pestaña</button>
      )}
    </form>
  );
}

function CargarFixture({ equipoId, equipo, torneo, existentes, guardarUno, recargar, cerrar }) {
  const [texto, setTexto] = useState('');
  const [comun, setComun] = useState({ torneo: torneo || '', citacion: '', cancha: '' });
  const [ocupado, setOcupado] = useState(false);
  const [listo, setListo] = useState(null);
  const [error, setError] = useState('');
  const { partidos, problemas } = leerFixture(texto, hoyIso());
  // Si ya hay un partido de este plantel ese día, no se repite.
  const repetido = (p) => existentes.some((x) => x.fecha === p.fecha);
  const nuevos = partidos.filter((p) => !repetido(p));
  const set = (k) => (e) => setComun((c) => ({ ...c, [k]: e.target.value }));

  const enviar = async (e) => {
    e.preventDefault();
    if (problemas.length || !nuevos.length) return;
    setOcupado(true); setError('');
    let hechos = 0;
    try {
      for (const p of nuevos) {
        const d = { equipoId, ...p, torneo: comun.torneo.trim(), citacion: comun.citacion, cancha: comun.cancha.trim() };
        await (crearPartidoSuelto ? crearPartidoSuelto(d) : guardarUno(d));
        hechos += 1;
      }
      setListo(hechos);
      setTexto('');
    } catch (err) {
      setError(`${hechos ? `Se cargaron ${hechos} y ` : ''}falló una: ${err.message}`);
    } finally {
      await recargar();
      setOcupado(false);
    }
  };

  if (listo != null) {
    return (
      <div className="card">
        <p className="exito" style={{ marginTop: 0 }}>Listo: se cargaron {listo} {listo === 1 ? 'partido' : 'partidos'} de {equipo}.</p>
        <p className="ayuda abajo">Si una fecha cambia de día o se suspende, se corrige desde el partido.</p>
        <div className="botones"><button type="button" className="btn secundario" onClick={cerrar}>Cerrar</button></div>
      </div>
    );
  }

  return (
    <form className="card" onSubmit={enviar}>
      <h2 className="posiciones-form-titulo">Cargar fechas · {equipo}</h2>
      <label htmlFor="fx-texto">Una línea por partido</label>
      <p className="ayuda">Día/mes, hora de inicio si se sabe, y el rival. Ej.: <em>14/11 Rival FC</em> o <em>21/11 09:00 Otro Rival</em>.</p>
      <textarea id="fx-texto" rows={8} value={texto} onChange={(e) => setTexto(e.target.value)} spellCheck={false}
                placeholder={'14/11 Rival FC\n21/11 09:00 Otro Rival\n…'} />
      {problemas.map((p) => <p key={p} className="error">{p}</p>)}
      {partidos.length > 0 && (
        <ul className="posiciones-fixture">
          {partidos.map((p) => (
            <li key={`${p.fecha}-${p.rival}`} className={repetido(p) ? 'repetido' : ''}>
              <span>{fechaLarga(p.fecha)}{p.horaInicio ? ` · ${p.horaInicio}` : ''}</span>
              <span>vs {p.rival}{repetido(p) ? ' · ya hay partido ese día' : ''}</span>
            </li>
          ))}
        </ul>
      )}
      <label htmlFor="fx-torneo">Campeonato (opcional, para todas)</label>
      <input id="fx-torneo" value={comun.torneo} onChange={set('torneo')} placeholder="Ej.: Clausura 2026" />
      <label htmlFor="fx-citacion">Hora de citación (opcional, para todas)</label>
      <input id="fx-citacion" type="time" value={comun.citacion} onChange={set('citacion')} />
      <label htmlFor="fx-cancha">Cancha (opcional, para todas)</label>
      <input id="fx-cancha" value={comun.cancha} onChange={set('cancha')} placeholder="Ej.: Cancha 1, Complejo…" />
      {error && <p className="error" role="alert">{error}</p>}
      <div className="botones">
        <button className="btn" disabled={ocupado || !nuevos.length || problemas.length > 0}>
          {ocupado ? 'Cargando…' : `Cargar ${nuevos.length || ''} ${nuevos.length === 1 ? 'partido' : 'partidos'}`}
        </button>
        <button type="button" className="btn secundario" onClick={cerrar} disabled={ocupado}>Cancelar</button>
      </div>
    </form>
  );
}

export default function Tabla() {
  const { persona } = useSesion();
  const { cargando, error, tablas, guardar, borrar, recargar, conectar, refrescar } = useTablas();
  const [trayendo, setTrayendo] = useState(false);
  const [aviso, setAviso] = useState('');
  const partidos = usePartidos(persona);
  const [elegido, setElegido] = useState(null);
  const [pestana, setPestana] = useState(null);
  const [editando, setEditando] = useState(null); // 'tabla' | 'nueva' | 'fixture'

  // Siempre fresca al entrar: otro encargado pudo actualizarla.
  useEffect(() => { recargar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Parte en el plantel propio (el primero, si juega en dos).
  const propio = tablas.find((t) => persona.equipos?.some((e) => e.id === t.equipoId))?.equipoId;
  const actualId = elegido ?? propio ?? tablas[0]?.equipoId;
  // Un botón por plantel (las pestañas vienen como filas aparte).
  const planteles = tablas.filter((t, i) => tablas.findIndex((x) => x.equipoId === t.equipoId) === i);
  const pestanas = tablas.filter((t) => t.equipoId === actualId);
  const tabla = pestanas.find((t) => t.grupo === pestana) ?? pestanas[0];
  const grupo = tabla?.grupo ?? '';
  const conocidos = [...new Set(pestanas.flatMap((t) => t.filas.map((f) => f.equipo)))];
  const proximos = partidos.partidos.filter((p) => p.equipoId === actualId).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const delPlantel = partidos.todos.filter((p) => p.equipoId === actualId);
  const jara = tabla?.filas.findIndex((f) => f.esJara) ?? -1;
  const elegir = (id) => { setElegido(id); setPestana(null); setEditando(null); setAviso(''); };
  const elegirPestana = (g) => { setPestana(g); setEditando(null); setAviso(''); };
  const cerrarEditor = (g) => { setEditando(null); if (g !== undefined) setPestana(g); };

  // Si está conectada a la liga, al mirarla se revisa sola (la base decide si
  // ya pasaron 3 horas). Sin ruido si la liga no responde.
  const conectada = !!tabla?.conectada;
  useEffect(() => {
    if (actualId && conectada) refrescar(actualId, false, grupo).catch(() => {});
  }, [actualId, grupo, conectada]); // eslint-disable-line react-hooks/exhaustive-deps

  const traerAhora = async () => {
    setTrayendo(true); setAviso('');
    try { setAviso((await refrescar(tabla.equipoId, true, grupo)) ? 'Listo: la tabla quedó al día con la liga.' : 'La tabla ya estaba al día con la liga.'); }
    catch (e) { setAviso(e.message); }
    finally { setTrayendo(false); }
  };

  return (
    <>
      <Link to="/partidos" className="volver">‹ Partidos</Link>
      <h1 className="titulo display">Tabla de posiciones</h1>
      <p className="subtitulo">Cómo vamos en cada liga y las fechas que vienen.</p>
      {error && <p className="error" role="alert">{error}</p>}
      {cargando && !tablas.length ? <p className="vacio suelto">Cargando…</p> : (
        <>
          {planteles.length > 1 && (
            <div className="chips" role="radiogroup" aria-label="Plantel" style={{ marginTop: 0, marginBottom: 12 }}>
              {planteles.map((t) => (
                <button key={t.equipoId} type="button" role="radio" aria-checked={t.equipoId === actualId}
                        className={`chip ${t.equipoId === actualId ? 'activo' : ''}`} onClick={() => elegir(t.equipoId)}>{t.equipo}</button>
              ))}
            </div>
          )}
          {pestanas.length > 1 && editando !== 'nueva' && (
            <div className="posiciones-pestanas" role="tablist" aria-label="Tablas de este plantel">
              {pestanas.map((t) => (
                <button key={t.grupo} type="button" role="tab" aria-selected={t.grupo === grupo}
                        className={t.grupo === grupo ? 'activa' : ''} onClick={() => elegirPestana(t.grupo)}>{t.grupo || 'Tabla'}</button>
              ))}
            </div>
          )}
          {tabla && (editando === 'tabla' || editando === 'nueva') && (
            <EditarTabla key={`${actualId}-${grupo}-${editando}`} tabla={tabla} nueva={editando === 'nueva'}
                         otras={pestanas.filter((t) => editando === 'nueva' || t.grupo !== grupo).map((t) => t.grupo)}
                         conocidos={conocidos} guardar={guardar} borrar={borrar} conectar={conectar} refrescar={refrescar} cerrar={cerrarEditor} />
          )}
          {tabla && editando !== 'tabla' && editando !== 'nueva' && (
            <>
              {tabla.filas.length ? (
                <>
                  {jara >= 0 && (
                    <p className="posiciones-resumen">
                      El Jara va <strong>{jara + 1}º</strong> de {tabla.filas.length}, con {tabla.filas[jara].pts} puntos
                      {tabla.torneo ? ` · ${tabla.torneo}` : ''}.
                    </p>
                  )}
                  <TablaPosiciones filas={tabla.filas} />
                  <p className="ayuda abajo">
                    {tabla.actualizadaEn ? `Actualizada el ${fechaCorta(tabla.actualizadaEn.slice(0, 10))}.` : ''}
                    {tabla.conectada ? ' Se actualiza sola desde la liga.' : ''}
                    {tabla.fuente && <> <a className="enlace" href={tabla.fuente} target="_blank" rel="noopener noreferrer">Ver en la página de la liga</a></>}
                  </p>
                </>
              ) : (
                <p className="vacio suelto">
                  Todavía no se carga la tabla de {tabla.equipo}.{tabla.puedoEditar ? ' Cópiala de la página de la liga o sube un pantallazo.' : ' La sube el encargado del plantel.'}
                </p>
              )}
              {aviso && <p className="ayuda abajo" role="status">{aviso}</p>}
              {tabla.puedoEditar && tabla.conectada && (
                <button type="button" className="btn secundario" style={{ marginTop: 12 }} onClick={traerAhora} disabled={trayendo}>
                  {trayendo ? 'Trayendo la tabla…' : 'Actualizar desde la liga'}
                </button>
              )}
              {tabla.puedoEditar && (
                <button type="button" className="btn secundario" style={{ marginTop: 12 }} onClick={() => setEditando('tabla')}>
                  {tabla.conectada ? 'Cambiar a mano o desconectar' : tabla.filas.length ? 'Actualizar la tabla' : 'Cargar la tabla'}
                </button>
              )}
              {tabla.puedoEditar && tabla.filas.length > 0 && (
                <button type="button" className="btn secundario" style={{ marginTop: 12 }} onClick={() => setEditando('nueva')}>
                  Agregar otra tabla (ej. la general)
                </button>
              )}
            </>
          )}

          {tabla && (
            <>
              <h2 className="seccion">Próximas fechas</h2>
              {editando === 'fixture' ? (
                <CargarFixture equipoId={tabla.equipoId} equipo={tabla.equipo} torneo={tabla.torneo} existentes={delPlantel}
                               guardarUno={partidos.guardar} recargar={partidos.recargar} cerrar={() => setEditando(null)} />
              ) : (
                <>
                  {proximos.length ? (
                    <ul className="card posiciones-proximos">
                      {proximos.map((p) => (
                        <li key={p.id}>
                          <Link to={`/partidos/${p.id}`}>
                            <span className="posiciones-proximo-fecha">{fechaLarga(p.fecha)}{p.horaInicio ? ` · ${p.horaInicio}` : ''}</span>
                            <span className="posiciones-proximo-rival">vs {p.rival}</span>
                            <Icono nombre="flecha" size={16} />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="vacio suelto">{partidos.cargando ? 'Cargando…' : `No hay partidos programados para ${tabla.equipo}.`}</p>
                  )}
                  {tabla.puedoEditar && (
                    <button type="button" className="btn secundario" style={{ marginTop: 12 }} onClick={() => setEditando('fixture')}>
                      Cargar varias fechas de una vez
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
