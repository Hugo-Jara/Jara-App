import { useSesion } from '../lib/sesion.jsx';
import { useListas, recordatorioEntrenamiento } from '../lib/listas.js';
import RecordarPorWhatsApp from '../components/RecordarPorWhatsApp.jsx';

export default function Entrenar() {
  const { persona } = useSesion();
  const yo = persona.nombre.split(' ')[0];
  const { entrenamiento: e, inscrito, inscribirme, bajarme } = useListas(yo);

  if (!e) {
    return (
      <>
        <h1 className="titulo display">Entrenar</h1>
        <p className="vacio suelto">No hay entrenamientos abiertos por ahora.</p>
      </>
    );
  }
  const libres = e.cupo - e.inscritos.length;
  return (
    <>
      <div className="sobretitulo">Entrenamiento</div>
      <h1 className="titulo display">{e.fecha}</h1>
      <dl className="datos">
        <div><dt>Hora</dt><dd>{e.hora}</dd></div>
        <div><dt>Lugar</dt><dd>{e.lugar}</dd></div>
        {e.precios.map(([categoria, monto]) => (
          <div key={categoria}><dt>{categoria}</dt><dd>{monto}</dd></div>
        ))}
      </dl>

      <div className="card">
        {inscrito ? (
          <p className="respuesta sin-margen" role="status">
            Estás inscrito. <button className="enlace" onClick={bajarme}>Bajarme de la lista</button>
          </p>
        ) : libres > 0 ? (
          <button className="btn" onClick={inscribirme}>Me inscribo</button>
        ) : (
          <p className="vacio">La lista está completa.</p>
        )}
        <p className="conteo">{libres} cupos libres de {e.cupo}. {e.multa}</p>
      </div>

      <div className="card">
        <h3 className="grupo-titulo voy">Inscritos <span>{e.inscritos.length}</span></h3>
        <ol className="nombres">
          {e.inscritos.map((i) => (
            <li key={i.nombre}>
              <span className="nombre">{i.nombre}</span>
              {i.galleta && <span className="marca">galleta</span>}
              <span className={`pago ${i.pagado ? 'si' : 'no'}`}>{i.pagado ? 'Pagó' : 'Por pagar'}</span>
            </li>
          ))}
        </ol>
        {e.deben.length > 0 && (
          <section className="grupo">
            <h3 className="grupo-titulo baja">Deben <span>{e.deben.length}</span></h3>
            <ol className="nombres">
              {e.deben.map((d) => (
                <li key={d.nombre}><span className="nombre">{d.nombre}</span><span className="comentario">{d.de}</span></li>
              ))}
            </ol>
          </section>
        )}
      </div>
      <RecordarPorWhatsApp mensaje={(url) => recordatorioEntrenamiento(e, url)} />
    </>
  );
}
