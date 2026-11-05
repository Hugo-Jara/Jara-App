import { useState } from 'react';
import NombreConApodo from './NombreConApodo.jsx';
import { EMOJIS, MAX_COMENTARIO } from '../lib/charla.js';
import { correrDias, diaSemana } from '../lib/fechas.js';

// Lo que pasa después del partido: jugador del partido (MVP), reacciones y
// comentarios. Los datos y las acciones vienen de useCharla (src/lib/charla.js).

// "hace 5 min", "hace 3 h", "12 nov · 21:30"
function cuando(iso) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  if (min < 60 * 24) return `hace ${Math.round(min / 60)} h`;
  const d = new Date(iso);
  return `${d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })} · ${d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}`;
}

// Reaccionar: quien llama recibe el emoji. Se ven las que ya hay (con su
// número) y, al tocar "+", las demás.
export function Reacciones({ lista, reaccionar, etiqueta, siempreAbiertas = false }) {
  const [abiertas, setAbiertas] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const tocar = async (emoji) => {
    if (ocupado) return;
    setOcupado(true);
    try { await reaccionar(emoji); setAbiertas(false); } catch { /* se ve igual al recargar */ }
    setOcupado(false);
  };
  const hay = Object.fromEntries(lista.map((r) => [r.emoji, r]));
  const mostrar = siempreAbiertas || abiertas ? EMOJIS : lista.map((r) => r.emoji);
  return (
    <div className="charla-reacciones" role="group" aria-label={etiqueta}>
      {mostrar.map((e) => (
        <button key={e} type="button" disabled={ocupado} aria-pressed={!!hay[e]?.mia}
                aria-label={`${e}${hay[e] ? `, ${hay[e].n}` : ''}`}
                className={`charla-emoji ${hay[e]?.mia ? 'mia' : ''} ${hay[e] ? '' : 'vacia'}`} onClick={() => tocar(e)}>
          <span aria-hidden="true">{e}</span>{hay[e] && <span className="charla-n">{hay[e].n}</span>}
        </button>
      ))}
      {!siempreAbiertas && (
        <button type="button" className="charla-emoji mas" aria-expanded={abiertas} aria-label={abiertas ? 'Cerrar reacciones' : 'Reaccionar'}
                onClick={() => setAbiertas(!abiertas)}>{abiertas ? '×' : '☺︎+'}</button>
      )}
    </div>
  );
}

// El jugador del partido: votar mientras está abierta y ver al ganador al cerrar.
export function JugadorDelPartido({ partido, yo, mvp, votar }) {
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  if (!mvp || (!mvp.abierta && !mvp.cerrada)) return null;
  const cierre = `el ${diaSemana(correrDias(partido.fecha, 1))} a las 23:59`;
  const elegir = async (id) => {
    setError(''); setOcupado(true);
    try { await votar(id); } catch (x) { setError(x.message); }
    setOcupado(false);
  };
  const votado = mvp.candidatos.find((c) => c.id === mvp.miVoto);

  if (mvp.cerrada) {
    return (
      <div className="card mvp">
        <div className="sobretitulo">Jugador del partido</div>
        {mvp.ganadores.length ? (
          <>
            <ul className="mvp-ganadores">
              {mvp.ganadores.map((g) => (
                <li key={g.id}>
                  <span className="mvp-estrella" aria-hidden="true">★</span>
                  <span className="mvp-nombre"><NombreConApodo id={g.id} nombre={g.nombre} enlace /></span>
                  <span className="mvp-votos">{g.votos} {g.votos === 1 ? 'voto' : 'votos'}</span>
                </li>
              ))}
            </ul>
            {mvp.ganadores.length > 1 && <p className="ayuda abajo">Empataron en votos: son MVP los {mvp.ganadores.length}.</p>}
          </>
        ) : <p className="vacio">Nadie votó en este partido.</p>}
      </div>
    );
  }

  return (
    <div className="card mvp">
      <div className="sobretitulo">Jugador del partido</div>
      {mvp.puedoVotar ? (
        <>
          <p className="mvp-pregunta">¿Quién fue el mejor del partido?</p>
          <div className="mvp-candidatos" role="radiogroup" aria-label="Jugador del partido">
            {mvp.candidatos.filter((c) => c.id !== yo.id).map((c) => (
              <button key={c.id} type="button" role="radio" aria-checked={mvp.miVoto === c.id} disabled={ocupado}
                      className={`chip ${mvp.miVoto === c.id ? 'activo' : ''}`} onClick={() => elegir(c.id)}>
                <NombreConApodo id={c.id} nombre={c.nombre} />
              </button>
            ))}
          </div>
          <p className="ayuda abajo">
            {votado ? <>Votaste por <strong>{votado.nombre}</strong>. Puedes cambiarlo hasta {cierre}.</> : `Votan solo los que jugaron, y no por uno mismo. Cierra ${cierre}.`}
          </p>
        </>
      ) : (
        <p className="vacio">Votan los que jugaron este partido. El MVP se conoce {cierre}.</p>
      )}
      <p className="mvp-conteo">{mvp.votaron === 0 ? 'Todavía nadie vota.' : `Ya ${mvp.votaron === 1 ? 'votó 1' : `votaron ${mvp.votaron}`}. El resultado se ve al cerrar.`}</p>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

function Escribir({ enviar, alListo, placeholder, autoFocus, etiqueta }) {
  const [texto, setTexto] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const mandar = async (e) => {
    e.preventDefault();
    if (!texto.trim()) return;
    setError(''); setEnviando(true);
    try { await enviar(texto.trim()); setTexto(''); alListo?.(); } catch (x) { setError(x.message); }
    setEnviando(false);
  };
  return (
    <form className="charla-escribir" onSubmit={mandar}>
      <textarea aria-label={etiqueta} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={MAX_COMENTARIO}
                rows={2} placeholder={placeholder} autoFocus={autoFocus} />
      <div className="charla-escribir-pie">
        {texto.length > MAX_COMENTARIO - 60 && <span className="ayuda">{MAX_COMENTARIO - texto.length}</span>}
        <button className="btn chico" disabled={enviando || !texto.trim()}>{enviando ? 'Enviando…' : 'Enviar'}</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  );
}

function Comentario({ c, respuestas = [], acciones, respondiendo, setRespondiendo }) {
  const [error, setError] = useState('');
  const borrar = async (x) => {
    if (!window.confirm('¿Borrar este comentario?')) return;
    setError('');
    try { await acciones.borrar(x.id); } catch (e) { setError(e.message); }
  };
  const uno = (x, esRespuesta) => (
    <div className={`charla-comentario ${esRespuesta ? 'charla-respuesta' : ''}`} key={x.id}>
      <div className="charla-cabeza">
        <span className="charla-autor"><NombreConApodo id={x.personaId} nombre={x.nombre} enlace /></span>
        <span className="charla-cuando">{cuando(x.creadoEn)}</span>
      </div>
      {x.borrado ? <p className="charla-texto borrado">Comentario borrado</p> : <p className="charla-texto">{x.texto}</p>}
      {!x.borrado && (
        <div className="charla-acciones">
          <Reacciones lista={x.reacciones} reaccionar={(e) => acciones.reaccionarComentario(x.id, e)} etiqueta="Reacciones al comentario" />
          <button type="button" className="enlace" onClick={() => setRespondiendo(respondiendo === c.id ? null : c.id)}>Responder</button>
          {x.puedoBorrar && <button type="button" className="enlace charla-borrar" onClick={() => borrar(x)}>Borrar</button>}
        </div>
      )}
    </div>
  );
  return (
    <li className="charla-hilo">
      {uno(c, false)}
      {respuestas.map((r) => uno(r, true))}
      {respondiendo === c.id && (
        <div className="charla-comentario charla-respuesta">
          <Escribir enviar={(t) => acciones.comentar(t, c.id)} alListo={() => setRespondiendo(null)}
                    placeholder={`Responder a ${c.nombre}…`} etiqueta="Tu respuesta" autoFocus />
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </li>
  );
}

// La cadena de comentarios del partido. Las respuestas van debajo del primero.
export function Comentarios({ comentarios, acciones }) {
  const [respondiendo, setRespondiendo] = useState(null);
  const raices = comentarios.filter((c) => !c.padreId);
  // Un hilo con todo borrado no aporta: se oculta.
  const visibles = raices.filter((c) => !c.borrado || comentarios.some((r) => r.padreId === c.id && !r.borrado));
  return (
    <div className="card charla">
      <div className="sobretitulo">Comentarios {comentarios.filter((c) => !c.borrado).length > 0 && <span className="charla-total">{comentarios.filter((c) => !c.borrado).length}</span>}</div>
      {visibles.length === 0 && <p className="vacio">Nadie ha comentado todavía. ¡Parte tú!</p>}
      <ul className="charla-lista">
        {visibles.map((c) => (
          <Comentario key={c.id} c={c} respuestas={comentarios.filter((r) => r.padreId === c.id)} acciones={acciones}
                      respondiendo={respondiendo} setRespondiendo={setRespondiendo} />
        ))}
      </ul>
      <Escribir enviar={(t) => acciones.comentar(t, null)} placeholder="¡Gran partido muchachos!…" etiqueta="Tu comentario" />
    </div>
  );
}
