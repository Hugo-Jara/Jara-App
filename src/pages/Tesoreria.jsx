import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useSesion } from '../lib/sesion.jsx';
import { planteles, resumen, estadoJugador, movimientosDe, pesos, mesActual, NOMBRE_CONDICION } from '../lib/tesoreria.js';
import { fechaCorta } from '../lib/fechas.js';
import RecordarPorWhatsApp from '../components/RecordarPorWhatsApp.jsx';

// Quién ve Tesorería: los administradores (todo el club) y los tesoreros (su plantel).
export const puedeVerTesoreria = (persona) =>
  !!persona && (persona.esAdmin || persona.equipos?.some((e) => e.tesorero));

function Cifra({ etiqueta, valor, clase, nota }) {
  return (
    <div className="kpi">
      <div className="kpi-etiqueta">{etiqueta}</div>
      <div className={`kpi-valor ${clase ?? ''}`}>{valor}</div>
      {nota && <div className="kpi-nota">{nota}</div>}
    </div>
  );
}

function QuienPago({ plantel }) {
  const estados = plantel.jugadores.map((j) => estadoJugador(plantel, j));
  const deben = estados.filter((e) => e.debe > 0);
  const alDia = estados.filter((e) => e.alDia);
  const exentos = estados.filter((e) => e.exento);
  return (
    <div className="card">
      <div className="sobretitulo">Cuota de {mesActual()}</div>
      <section className="grupo">
        <h3 className="grupo-titulo baja">Deben <span>{deben.length}</span></h3>
        {deben.length === 0 ? <p className="vacio">Nadie debe este mes.</p> : (
          <ol className="nombres">
            {deben.map((e) => (
              <li key={e.nombre}>
                <span className="nombre">{e.nombre}</span>
                <span className="comentario">debe {pesos(e.debe)}{e.pagado > 0 ? ` · abonó ${pesos(e.pagado)}` : ''}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
      <section className="grupo">
        <h3 className="grupo-titulo voy">Al día <span>{alDia.length}</span></h3>
        <ol className="nombres">
          {alDia.map((e) => (
            <li key={e.nombre}>
              <span className="nombre">{e.nombre}</span>
              {e.condicion !== 'ok' && <span className="marca">{NOMBRE_CONDICION[e.condicion]}</span>}
            </li>
          ))}
        </ol>
      </section>
      {exentos.length > 0 && (
        <section className="grupo">
          <h3 className="grupo-titulo pendiente">Sin cuota <span>{exentos.length}</span></h3>
          <ol className="nombres">
            {exentos.map((e) => <li key={e.nombre}><span className="nombre">{e.nombre}</span></li>)}
          </ol>
        </section>
      )}
    </div>
  );
}

export default function Tesoreria() {
  const { persona } = useSesion();
  const todos = planteles();
  // Un tesorero solo ve su plantel; un administrador ve todos y la suma del club.
  const visibles = persona?.esAdmin ? todos : todos.filter((p) => persona?.equipos?.some((e) => e.tesorero && e.id === p.id));
  const [eleccion, setEleccion] = useState(visibles.length === 1 ? visibles[0].id : 'todos');

  if (!puedeVerTesoreria(persona)) return <Navigate to="/mas" replace />;

  const opciones = visibles.length > 1 ? [{ id: 'todos', nombre: 'Todo el club' }, ...visibles] : visibles;
  const plantel = visibles.find((p) => p.id === eleccion);
  const grupo = plantel ? [plantel] : visibles;
  const r = resumen(grupo);
  const movs = movimientosDe(grupo);

  return (
    <>
      <Link to="/mas" className="volver">‹ Más</Link>
      <h1 className="titulo display">Tesorería</h1>
      <p className="subtitulo">Cuánta plata hay, quién pagó y cuánto falta recaudar.</p>
      <div className="aviso-demo">
        Prototipo con datos inventados. Así podría verse tu tablero: dinos qué te sirve y qué falta antes de conectar los números reales.
      </div>

      {opciones.length > 1 && (
        <div className="segmentos selector-plantel" role="radiogroup" aria-label="Plantel">
          {opciones.map((o) => (
            <button key={o.id} type="button" role="radio" aria-checked={eleccion === o.id}
                    className={`segmento ${eleccion === o.id ? 'activo voy' : ''}`}
                    onClick={() => setEleccion(o.id)}>
              {o.nombre}
            </button>
          ))}
        </div>
      )}

      <div className="kpis">
        <Cifra etiqueta="En caja" valor={pesos(r.caja)} clase={r.caja < 0 ? 'negativo' : ''} nota="ingresos menos gastos" />
        <Cifra etiqueta="Falta recaudar" valor={pesos(r.falta)} nota={`${r.deben} ${r.deben === 1 ? 'persona' : 'personas'} por pagar`} />
      </div>

      <div className="card">
        <div className="sobretitulo">Meta de {mesActual()}</div>
        <div className="progreso-texto">
          <strong>{pesos(r.recaudado)}</strong> de {pesos(r.meta)} <span>{r.porcentaje}%</span>
        </div>
        <div className="progreso" role="progressbar" aria-valuenow={r.porcentaje} aria-valuemin={0} aria-valuemax={100}>
          <div style={{ width: `${r.porcentaje}%` }} />
        </div>
        <p className="conteo">{r.alDia} al día · {r.deben} con deuda · {r.exentos} sin cuota</p>
      </div>

      {plantel ? (
        <>
          <QuienPago plantel={plantel} />
          <RecordarPorWhatsApp mensaje={() =>
            `💰 Cuota de ${mesActual()} · ${plantel.nombre}\n` +
            `Van ${r.alDia} al día y faltan ${r.deben} por pagar.\n` +
            `Revisa tu estado en la app 👉 ${window.location.origin}${import.meta.env.BASE_URL}`} />
        </>
      ) : (
        <div className="card">
          <p className="vacio">Elige un plantel arriba para ver quién pagó y quién debe.</p>
        </div>
      )}

      <div className="card" style={{ marginTop: 14 }}>
        <div className="sobretitulo">Ingresos y gastos</div>
        <p className="conteo" style={{ margin: '0 0 6px' }}>
          Ingresaron {pesos(r.ingresos)} · salieron {pesos(r.gastos)}
        </p>
        <ol className="movimientos">
          {movs.map((m) => (
            <li key={m.id}>
              <div className="mov-texto">
                <span className="nombre">{m.descripcion}</span>
                <span className="comentario">
                  {fechaCorta(m.fecha)} · {m.categoria}{!plantel ? ` · ${m.plantel}` : ''}
                </span>
              </div>
              <span className={`mov-monto ${m.tipo === 'gasto' ? 'sale' : 'entra'}`}>{m.tipo === 'gasto' ? '−' : '+'}{pesos(m.monto)}</span>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}
