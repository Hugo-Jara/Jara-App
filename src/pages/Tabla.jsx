import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSesion } from '../lib/sesion.jsx';
import { usePartidos } from '../lib/partidos.js';
import { useTablas, diferencia, leerTabla, textoDeTabla, leerFixture, crearPartidoSuelto } from '../lib/tabla.js';
import { leerCaptura, pestanaDeCaptura } from '../lib/captura.js';
import { fechaLarga, fechaCorta, hoyIso, correrDias } from '../lib/fechas.js';
import Icono from '../components/Icono.jsx';

// "Cómo vamos": la tabla de cada plantel y sus próximas fechas. El encargado
// copia la tabla de la página de la liga (o sube un pantallazo) y puede cargar
// todas las fechas del campeonato de una vez. Un plantel puede tener varias
// tablas (ej. "Grupo A" y "General"), que se ven con pestañas (0036).

// Pantallazo del celular sin goles: cómo sacar la tabla completa.
const SIN_GOLES = 'Faltan los goles (GF, GC y diferencia). Para la tabla completa, achica la página de la liga al 50% en tu celular (menú del navegador > zoom) y saca el pantallazo de nuevo.';

// "hoy a las 18:05", "ayer a las 9:30", "el 3 de noviembre a las 18:05".
function cuando(iso) {
  const d = new Date(iso);
  const dia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const hora = d.toLocaleTimeString('es-CL', { hour: 'numeric', minute: '2-digit' });
  const hoy = hoyIso();
  if (dia === hoy) return `hoy a las ${hora}`;
  if (dia === correrDias(hoy, -1)) return `ayer a las ${hora}`;
  return `el ${fechaCorta(dia)} a las ${hora}`;
}

const conSigno = (n) => (n > 0 ? `+${n}` : String(n));

// En el celular copafacil no muestra los goles: si ninguna fila los trae, no
// se muestran esas columnas.
function TablaPosiciones({ filas }) {
  const goles = filas.some((f) => f.gf || f.gc);
  return (
    <div className={`card posiciones ${goles ? '' : 'sin-goles'}`} role="table" aria-label="Tabla de posiciones">
      <div className="posiciones-fila cabeza" role="row">
        <span className="posiciones-puesto" role="columnheader">#</span>
        <span className="posiciones-equipo" role="columnheader">Equipo</span>
        <span className="posiciones-col" role="columnheader" title="Partidos jugados">PJ</span>
        <span className="posiciones-col" role="columnheader" title="Ganados">G</span>
        <span className="posiciones-col" role="columnheader" title="Empatados">E</span>
        <span className="posiciones-col" role="columnheader" title="Perdidos">P</span>
        {goles && (
          <>
            <span className="posiciones-col ancho" role="columnheader" title="Goles a favor">GF</span>
            <span className="posiciones-col ancho" role="columnheader" title="Goles en contra">GC</span>
            <span className="posiciones-col" role="columnheader" title="Diferencia de gol">DG</span>
          </>
        )}
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
          {goles && (
            <>
              <span className="posiciones-col ancho">{f.gf}</span>
              <span className="posiciones-col ancho">{f.gc}</span>
              <span className="posiciones-col">{conSigno(diferencia(f))}</span>
            </>
          )}
          <span className="posiciones-col pts">{f.pts}</span>
        </div>
      ))}
    </div>
  );
}

// El encargado actualiza la tabla con un pantallazo: la app lo lee, muestra
// cómo queda y en qué pestaña se guarda ("GRUPO A" → Grupo A; si la imagen no
// dice grupo, General). Corregir a mano y las opciones de la liga quedan a un
// toque, escondidas.
function EditarTabla({ tabla, pestanas, conocidos, archivoInicial, guardar, borrar, conectar, refrescar, cerrar }) {
  const [texto, setTexto] = useState(textoDeTabla(tabla.filas));
  const [destino, setDestino] = useState(tabla.grupo);
  const [leido, setLeido] = useState(false);
  const [manual, setManual] = useState(false);
  const [opciones, setOpciones] = useState(false);
  const [numero, setNumero] = useState(tabla.deporstarTabla ? String(tabla.deporstarTabla) : '');
  const [torneo, setTorneo] = useState(tabla.torneo ?? '');
  const [fuente, setFuente] = useState(tabla.fuente ?? '');
  const [ocupado, setOcupado] = useState(false);
  const [leyendo, setLeyendo] = useState(null); // avance de 0 a 1 mientras lee el pantallazo
  const [avisos, setAvisos] = useState([]);
  const [error, setError] = useState('');
  const archivo = useRef(null);
  const { filas, problemas } = leerTabla(texto);
  const numeroLimpio = numero.trim();
  const numeroMalo = numeroLimpio !== '' && !/^\d{1,8}$/.test(numeroLimpio);
  const cambiaNumero = !numeroMalo && numeroLimpio !== (tabla.deporstarTabla ? String(tabla.deporstarTabla) : '');
  const g = destino.trim().slice(0, 30);
  const cambiaFilas = leido || manual;
  const listo = !problemas.length && !numeroMalo && ((cambiaFilas && filas.length > 0) || cambiaNumero || (opciones && !cambiaFilas && tabla.filas.length > 0));

  const leer = async (img) => {
    if (!img) return;
    setLeyendo(0); setError(''); setAvisos([]);
    try {
      const r = await leerCaptura(img, conocidos, setLeyendo);
      if (!r.filas.length) {
        setError('No se encontró una tabla en la imagen. Prueba con un pantallazo solo de la tabla, donde se vean los nombres y los puntos.');
        return;
      }
      const nombre = pestanaDeCaptura(r, pestanas);
      const antes = pestanas.find((t) => t.grupo === nombre) ?? (pestanas.length === 1 ? pestanas[0] : null);
      const perdidos = !r.conGoles && antes?.filas.some((f) => f.gf || f.gc);
      setTexto(textoDeTabla(r.filas));
      setAvisos([...(perdidos ? ['Este pantallazo no trae los goles y la tabla guardada sí los tiene: si guardas, se pierden. Mejor saca el pantallazo con la página al 50% (o el teléfono horizontal).'] : []), ...r.avisos]);
      setDestino(nombre);
      setLeido(true);
    } catch (err) {
      setError(`No se pudo leer el pantallazo (${err.message}). Revisa la conexión e intenta de nuevo.`);
    } finally { setLeyendo(null); }
  };
  useEffect(() => { if (archivoInicial) leer(archivoInicial); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const enviar = async (e) => {
    e.preventDefault();
    if (!listo) return;
    setOcupado(true); setError('');
    // Se guarda en la pestaña con ese nombre (si existe, se reemplaza). Si el
    // plantel solo tenía la tabla vacía de siempre, esa pasa a tener el nombre.
    const existe = pestanas.some((t) => t.grupo === g);
    const vacia = pestanas.find((t) => t.grupo === '' && !t.filas.length && !t.conectada);
    const antes = existe ? g : g === tabla.grupo ? tabla.grupo : vacia ? '' : !leido ? tabla.grupo : null;
    try {
      if (cambiaFilas || opciones) {
        const lasFilas = cambiaFilas ? filas : tabla.filas;
        if (lasFilas.length) await guardar(tabla.equipoId, torneo.trim(), lasFilas, fuente.trim(), g, antes);
      }
      if (cambiaNumero) {
        await conectar(tabla.equipoId, numeroLimpio ? Number(numeroLimpio) : null, g);
        if (numeroLimpio) await refrescar(tabla.equipoId, true, g);
      }
      cerrar(g);
    } catch (err) { setError(err.message); setOcupado(false); }
  };

  const quitar = async () => {
    if (!window.confirm(`¿Borrar la tabla "${tabla.grupo || 'Tabla'}" de ${tabla.equipo}?`)) return;
    setOcupado(true); setError('');
    try { await borrar(tabla.equipoId, tabla.grupo); cerrar(null); }
    catch (err) { setError(err.message); setOcupado(false); }
  };

  return (
    <form className="card" onSubmit={enviar}>
      <h2 className="posiciones-form-titulo">Actualizar la tabla · {tabla.equipo}</h2>
      <input ref={archivo} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; leer(f); }} />
      <button type="button" className={`btn ${leido ? 'secundario' : ''}`} style={{ marginTop: 12 }} onClick={() => archivo.current?.click()} disabled={ocupado || leyendo != null}>
        {leyendo != null ? `Leyendo el pantallazo… ${Math.round(leyendo * 100)}%` : leido ? 'Subir otro pantallazo' : 'Subir un pantallazo de la tabla'}
      </button>
      {!leido && (
        <p className="ayuda abajo">Sirve el de "Por grupo" o el de "General". Con el teléfono horizontal salen también los goles.</p>
      )}
      {error && <p className="error" role="alert">{error}</p>}

      {leido && (
        <>
          {avisos.map((a) => <p key={a} className="aviso-captura">{a}</p>)}
          <p className="posiciones-destino">
            {g === 'General' ? 'Es la tabla general' : `Es la tabla del ${g}`} ({filas.length} equipos)
            {pestanas.some((t) => t.grupo === g && t.filas.length) ? ': reemplaza la que había.' : ': queda como pestaña nueva.'}
          </p>
        </>
      )}
      {(leido || manual) && filas.length > 0 && !problemas.length && (
        <>
          <p className="ayuda abajo">Así va a quedar. Revísala: a veces se lee mal un número o un nombre.</p>
          <TablaPosiciones filas={filas} />
          {!filas.some((f) => f.gf || f.gc) && <p className="aviso-captura">{SIN_GOLES}</p>}
        </>
      )}

      {manual ? (
        <>
          <label htmlFor="tb-texto">Corregir a mano, una línea por equipo</label>
          <p className="ayuda">Equipo, PJ, G, E, P, GF, GC y puntos. Ej.: <em>Hugo Jara 9 6 2 1 20 8 20</em>.</p>
          <textarea id="tb-texto" rows={8} value={texto} onChange={(e) => setTexto(e.target.value)} spellCheck={false} />
          {problemas.map((p) => <p key={p} className="error">{p}</p>)}
        </>
      ) : (
        <button type="button" className="enlace posiciones-mas" onClick={() => setManual(true)}>
          {leido ? 'Corregir a mano' : 'O escribirla a mano'}
        </button>
      )}

      {opciones ? (
        <>
          <label htmlFor="tb-torneo">Campeonato</label>
          <input id="tb-torneo" value={torneo} maxLength={80} onChange={(e) => setTorneo(e.target.value)} placeholder="Ej.: Clausura 2026" />
          <label htmlFor="tb-fuente">Link a la página de la liga</label>
          <input id="tb-fuente" type="url" value={fuente} onChange={(e) => setFuente(e.target.value)} placeholder="https://…" />
          <label htmlFor="tb-deporstar">Número de la tabla en Deporstar</label>
          <input id="tb-deporstar" inputMode="numeric" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Ej.: 71290" />
          <p className="ayuda abajo">Si la liga publica la tabla en Deporstar, con este número la app la trae sola. Vacío para desconectarla.</p>
          {numeroMalo && <p className="error">El número de Deporstar son solo dígitos.</p>}
        </>
      ) : (
        <button type="button" className="enlace posiciones-mas" onClick={() => setOpciones(true)}>Más opciones</button>
      )}

      <div className="botones">
        <button className="btn" disabled={ocupado || !listo}>{ocupado ? 'Guardando…' : 'Guardar la tabla'}</button>
        <button type="button" className="btn secundario" onClick={() => cerrar(undefined)} disabled={ocupado}>Cancelar</button>
      </div>
      {pestanas.length > 1 && tabla.filas.length > 0 && (
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

export default function Tabla({ incrustada = false }) {
  const { persona } = useSesion();
  const { cargando, error, tablas, guardar, borrar, recargar, conectar, refrescar } = useTablas();
  const [trayendo, setTrayendo] = useState(false);
  const [aviso, setAviso] = useState('');
  const partidos = usePartidos(persona);
  const [elegido, setElegido] = useState(null);
  const [pestana, setPestana] = useState(null);
  const [editando, setEditando] = useState(null); // 'tabla' | 'fixture'
  const [archivoInicial, setArchivoInicial] = useState(null);
  const subir = useRef(null);

  // Siempre fresca al entrar: otro encargado pudo actualizarla.
  useEffect(() => { recargar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Parte en el plantel propio (el primero, si juega en dos).
  const propio = tablas.find((t) => persona.equipos?.some((e) => e.id === t.equipoId))?.equipoId;
  const actualId = elegido ?? propio ?? tablas[0]?.equipoId;
  // Un botón por plantel (las pestañas vienen como filas aparte).
  const planteles = tablas.filter((t, i) => tablas.findIndex((x) => x.equipoId === t.equipoId) === i);
  // Primero los grupos, al final la general.
  const orden = (t) => (/^Grupo /.test(t.grupo) ? 0 : t.grupo === 'General' ? 2 : 1);
  const pestanas = tablas.filter((t) => t.equipoId === actualId).sort((a, b) => orden(a) - orden(b) || a.grupo.localeCompare(b.grupo));
  const tabla = pestanas.find((t) => t.grupo === pestana) ?? pestanas[0];
  const grupo = tabla?.grupo ?? '';
  const conocidos = [...new Set(pestanas.flatMap((t) => t.filas.map((f) => f.equipo)))];
  const proximos = partidos.partidos.filter((p) => p.equipoId === actualId).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const delPlantel = partidos.todos.filter((p) => p.equipoId === actualId);
  const jara = tabla?.filas.findIndex((f) => f.esJara) ?? -1;
  const elegir = (id) => { setElegido(id); setPestana(null); setEditando(null); setAviso(''); };
  const elegirPestana = (g) => { setPestana(g); setEditando(null); setAviso(''); };
  const cerrarEditor = (g) => { setEditando(null); setArchivoInicial(null); if (g !== undefined) setPestana(g); };
  // Un toque: se elige la imagen y se abre el editor ya leyéndola.
  const conPantallazo = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) { setArchivoInicial(f); setEditando('tabla'); setAviso(''); }
  };

  // Si está conectada a la liga, al mirarla se revisa sola (la base decide si
  // ya pasaron 3 horas). Sin ruido si la liga no responde. Las de copafacil
  // (jueves) se revisan junto con las fechas de la liga.
  const conectada = !!tabla?.deporstarTabla;
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
      {!incrustada && (
        <>
          <Link to="/partidos" className="volver">‹ La liga</Link>
          <h1 className="titulo display">Tabla de posiciones</h1>
          <p className="subtitulo">Cómo vamos en cada liga y las fechas que vienen.</p>
        </>
      )}
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
          {pestanas.length > 1 && (
            <div className="posiciones-pestanas" role="tablist" aria-label="Tablas de este plantel">
              {pestanas.map((t) => (
                <button key={t.grupo} type="button" role="tab" aria-selected={t.grupo === grupo}
                        className={t.grupo === grupo ? 'activa' : ''} onClick={() => elegirPestana(t.grupo)}>{t.grupo || 'Tabla'}</button>
              ))}
            </div>
          )}
          {tabla && editando === 'tabla' && (
            <EditarTabla key={`${actualId}-${grupo}`} tabla={tabla} pestanas={pestanas} conocidos={conocidos} archivoInicial={archivoInicial}
                         guardar={guardar} borrar={borrar} conectar={conectar} refrescar={refrescar} cerrar={cerrarEditor} />
          )}
          {tabla && editando !== 'tabla' && (
            <>
              {tabla.filas.length ? (
                <>
                  {jara >= 0 && (
                    <p className="posiciones-resumen">
                      El Jara va <strong>{jara + 1}º</strong> de {tabla.filas.length}, con {tabla.filas[jara].pts} puntos
                      {tabla.torneo ? ` · ${tabla.torneo}` : ''}.
                    </p>
                  )}
                  {tabla.actualizadaEn && <p className="posiciones-cuando">Última actualización: {cuando(tabla.actualizadaEn)}</p>}
                  <TablaPosiciones filas={tabla.filas} />
                  {tabla.puedoEditar && !tabla.conectada && !tabla.filas.some((f) => f.gf || f.gc) && <p className="aviso-captura">{SIN_GOLES}</p>}
                  <p className="ayuda abajo">

                    {tabla.conectada ? ' Se actualiza sola desde la liga.' : ''}
                    {tabla.fuente && <> <a className="enlace" href={tabla.fuente} target="_blank" rel="noopener noreferrer">Ver en la página de la liga</a></>}
                  </p>
                </>
              ) : (
                <p className="vacio suelto">
                  Todavía no se carga la tabla de {tabla.equipo}.{tabla.puedoEditar ? ' Sube un pantallazo de la tabla de la liga.' : ' La sube el encargado del plantel.'}
                </p>
              )}
              {aviso && <p className="ayuda abajo" role="status">{aviso}</p>}
              {!incrustada && tabla.puedoEditar && tabla.deporstarTabla && (
                <button type="button" className="btn secundario" style={{ marginTop: 12 }} onClick={traerAhora} disabled={trayendo}>
                  {trayendo ? 'Trayendo la tabla…' : 'Actualizar desde la liga'}
                </button>
              )}
              {tabla.puedoEditar && !tabla.conectada && (
                <>
                  <input ref={subir} type="file" accept="image/*" hidden onChange={conPantallazo} />
                  <button type="button" className="btn" style={{ marginTop: 12 }} onClick={() => subir.current?.click()}>
                    Actualizar con un pantallazo
                  </button>
                </>
              )}
              {tabla.puedoEditar && (
                <button type="button" className="enlace posiciones-mas" onClick={() => setEditando('tabla')}>
                  {tabla.conectada ? 'Opciones de la tabla' : 'Corregir a mano u otras opciones'}
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
