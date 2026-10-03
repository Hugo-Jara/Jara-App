import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSesion } from '../lib/sesion.jsx';
import { useEntrenamiento, horario, recordatorioEntrenamiento } from '../lib/entrenamiento.js';
import { fechaLarga, fechaCorta, hoyIso } from '../lib/fechas.js';
import { pesos } from '../lib/pedido.js';
import { plural } from '../lib/texto.js';
import RecordarPorWhatsApp from '../components/RecordarPorWhatsApp.jsx';

// El pago queda a la vista de todo el club; lo marca quien cobra.
function Pago({ fila, puedoCobrar, marcar }) {
  const texto = fila.pagado ? 'Pagó' : `Debe ${pesos(fila.monto)}`;
  if (!puedoCobrar) return <span className={`pago ${fila.pagado ? 'si' : 'no'}`}>{texto}</span>;
  return (
    <button className={`pago boton ${fila.pagado ? 'si' : 'no'}`} aria-pressed={fila.pagado}
            aria-label={`${fila.nombre}: ${texto}. Tocar para ${fila.pagado ? 'desmarcar el pago' : 'marcar como pagado'}`}
            onClick={() => marcar(fila.id, !fila.pagado)}>
      {texto}
    </button>
  );
}

export default function Entrenar() {
  const { persona } = useSesion();
  const t = useEntrenamiento(persona);
  const e = t.entrenamiento;
  const [invitado, setInvitado] = useState('');
  const [invitando, setInvitando] = useState(false);
  const [error, setError] = useState('');
  const intentar = (accion) => async (...a) => { setError(''); try { await accion(...a); } catch (x) { setError(x.message); } };

  if (t.cargando) return <p className="vacio suelto">Cargando…</p>;

  const deben = t.deben.length > 0 && (
    <div className="card">
      <h3 className="grupo-titulo baja">Deben de entrenamientos anteriores <span>{t.deben.length}</span></h3>
      <ol className="nombres">
        {t.deben.map((d) => (
          <li key={d.id}>
            <span className="nombre">{d.nombre}</span>
            <span className="comentario">{d.multa ? 'multa del ' : ''}{fechaCorta(d.fecha)}</span>
            <Pago fila={{ ...d, pagado: false }} puedoCobrar={t.puedoCobrar} marcar={intentar(t.marcarPago)} />
          </li>
        ))}
      </ol>
    </div>
  );

  if (!e) {
    return (
      <>
        <h1 className="titulo display">Entrenar</h1>
        <p className="vacio suelto">No hay entrenamientos abiertos por ahora.</p>
        {t.puedoAdministrar && <Link to="/entrenar/lista" className="btn">Abrir una lista</Link>}
        {error && <p className="error" role="alert">{error}</p>}
        {deben}
      </>
    );
  }
  const esHoy = e.fecha === hoyIso();
  const multa = e.multa > 0 ? `Si te bajas el mismo día se cobra una multa de ${pesos(e.multa)}.` : '';
  return (
    <>
      <div className="sobretitulo">Entrenamiento</div>
      <h1 className="titulo display">{fechaLarga(e.fecha)}</h1>
      <dl className="datos">
        {horario(e) && <div><dt>Hora</dt><dd>{horario(e)}</dd></div>}
        {e.lugar && <div><dt>Lugar</dt><dd>{e.lugar}</dd></div>}
        <div><dt>Junior</dt><dd>{pesos(e.precioJunior)}</dd></div>
        <div><dt>Senior</dt><dd>{pesos(e.precioSenior)}</dd></div>
        <div><dt>Invitado</dt><dd>{pesos(e.precioInvitado)}</dd></div>
      </dl>

      <div className="card">
        {t.miInscripcion ? (
          <p className="respuesta sin-margen" role="status">
            Estás inscrito.{' '}
            <button className="enlace" onClick={() => intentar(t.bajar)(t.miInscripcion.id)}>
              Bajarme de la lista{esHoy && e.multa > 0 ? ` (multa de ${pesos(e.multa)})` : ''}
            </button>
          </p>
        ) : t.libres > 0 ? (
          <button className="btn" onClick={intentar(t.inscribirme)}>Me inscribo · {pesos(e.miPrecio)}</button>
        ) : (
          <p className="vacio">La lista está completa.</p>
        )}
        <p className="conteo">{plural(t.libres, 'cupo libre', 'cupos libres')} de {e.cupo}. {multa}</p>

        {t.libres > 0 && (invitando ? (
          <form onSubmit={async (ev) => { ev.preventDefault(); await intentar(t.invitar)(invitado.trim()); setInvitado(''); setInvitando(false); }}>
            <label htmlFor="invitado">Nombre del invitado</label>
            <input id="invitado" required minLength={2} value={invitado} onChange={(ev) => setInvitado(ev.target.value)} />
            <div className="botones chicos">
              <button className="btn chico">Sumarlo · {pesos(e.precioInvitado)}</button>
              <button type="button" className="btn chico secundario" onClick={() => setInvitando(false)}>Cancelar</button>
            </div>
          </form>
        ) : (
          <p className="ayuda abajo"><button className="enlace" onClick={() => setInvitando(true)}>Sumar un invitado</button></p>
        ))}
        {error && <p className="error" role="alert">{error}</p>}
      </div>

      <div className="card">
        <h3 className="grupo-titulo voy">Inscritos <span>{e.inscritos.length}</span></h3>
        {e.inscritos.length === 0 && <p className="vacio">Todavía no se inscribe nadie.</p>}
        <ol className="nombres">
          {e.inscritos.map((i) => (
            <li key={i.id}>
              <span className="nombre">{i.nombre}</span>
              {i.invitado && <span className="marca">invitado{i.invitadoPor ? ` de ${i.invitadoPor.split(' ')[0]}` : ''}</span>}
              {((i.invitado && i.esMio) || (t.puedoAdministrar && i.personaId !== persona.id)) && (
                <button className="enlace quitar" aria-label={`Bajar a ${i.nombre} de la lista`} onClick={() => intentar(t.bajar)(i.id)}>Bajar</button>
              )}
              <Pago fila={i} puedoCobrar={t.puedoCobrar} marcar={intentar(t.marcarPago)} />
            </li>
          ))}
        </ol>
        {e.bajasTarde.length > 0 && (
          <section className="grupo">
            <h3 className="grupo-titulo baja">Se bajaron el mismo día <span>{e.bajasTarde.length}</span></h3>
            <ol className="nombres">
              {e.bajasTarde.map((i) => (
                <li key={i.id}>
                  <span className="nombre">{i.nombre}</span>
                  <span className="comentario">multa</span>
                  <Pago fila={i} puedoCobrar={t.puedoCobrar} marcar={intentar(t.marcarPago)} />
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
      {deben}
      {t.puedoAdministrar && (
        <>
          <RecordarPorWhatsApp mensaje={(url) => recordatorioEntrenamiento(e, url)} />
          <Link to="/entrenar/lista" className="btn secundario" style={{ marginTop: 10 }}>Editar la lista</Link>
        </>
      )}
    </>
  );
}
