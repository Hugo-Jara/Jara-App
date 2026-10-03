import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSesion } from '../lib/sesion.jsx';
import { useEntrenamiento } from '../lib/entrenamiento.js';

const soloNumero = (t) => Number(String(t).replace(/\D/g, '')) || 0;

// Abrir la lista del próximo entrenamiento, o corregir la que está abierta.
export default function EntrenamientoForm() {
  const ir = useNavigate();
  const { persona } = useSesion();
  const t = useEntrenamiento(persona);
  const actual = t.entrenamiento;
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [borrando, setBorrando] = useState(false);

  useEffect(() => {
    if (d || t.cargando) return;
    setD(actual
      ? { fecha: actual.fecha, horaInicio: actual.horaInicio ?? '', horaFin: actual.horaFin ?? '', lugar: actual.lugar ?? '',
          cupo: String(actual.cupo), precioJunior: String(actual.precioJunior), precioSenior: String(actual.precioSenior),
          precioInvitado: String(actual.precioInvitado), multa: String(actual.multa) }
      : { fecha: '', horaInicio: '20:00', horaFin: '22:00', lugar: '', cupo: '22',
          precioJunior: '2000', precioSenior: '4000', precioInvitado: '5000', multa: '1000' });
  }, [d, t.cargando, actual]);

  if (t.cargando || !d) return <p className="vacio suelto">Cargando…</p>;
  if (!t.puedoAdministrar) return <p className="vacio suelto">Las listas de entrenamiento las abre un encargado.</p>;
  const set = (campo) => (e) => setD({ ...d, [campo]: e.target.value });

  const enviar = async (e) => {
    e.preventDefault();
    const cupo = soloNumero(d.cupo);
    if (!cupo) return setError('Escribe cuántos cupos tiene la lista.');
    setError(''); setOcupado(true);
    try {
      await t.guardar({
        id: actual?.id, fecha: d.fecha, horaInicio: d.horaInicio, horaFin: d.horaFin, lugar: d.lugar.trim(), cupo,
        precioJunior: soloNumero(d.precioJunior), precioSenior: soloNumero(d.precioSenior),
        precioInvitado: soloNumero(d.precioInvitado), multa: soloNumero(d.multa),
      });
      ir('/entrenar');
    } catch (x) { setError(x.message); setOcupado(false); }
  };
  const precio = (id, texto, campo) => (
    <div>
      <label htmlFor={id}>{texto}</label>
      <input id={id} inputMode="numeric" value={d[campo]} onChange={set(campo)} />
    </div>
  );

  return (
    <>
      <Link to="/entrenar" className="volver">‹ Entrenar</Link>
      <h1 className="titulo display">{actual ? 'Editar la lista' : 'Abrir una lista'}</h1>
      <form className="card" onSubmit={enviar}>
        <label htmlFor="ef-fecha" style={{ marginTop: 0 }}>Día</label>
        <input id="ef-fecha" type="date" required value={d.fecha} onChange={set('fecha')} />
        <div className="dos">
          <div>
            <label htmlFor="ef-desde">Desde</label>
            <input id="ef-desde" type="time" value={d.horaInicio} onChange={set('horaInicio')} />
          </div>
          <div>
            <label htmlFor="ef-hasta">Hasta</label>
            <input id="ef-hasta" type="time" value={d.horaFin} onChange={set('horaFin')} />
          </div>
        </div>
        <label htmlFor="ef-lugar">Lugar</label>
        <input id="ef-lugar" value={d.lugar} onChange={set('lugar')} />
        <label htmlFor="ef-cupo">Cupos</label>
        <input id="ef-cupo" inputMode="numeric" required value={d.cupo} onChange={set('cupo')} />
        <fieldset className="bloque">
          <legend>Precios (en pesos)</legend>
          <div className="dos">
            {precio('ef-junior', 'Junior', 'precioJunior')}
            {precio('ef-senior', 'Senior', 'precioSenior')}
            {precio('ef-invitado', 'Invitado', 'precioInvitado')}
            {precio('ef-multa', 'Multa por bajarse el mismo día', 'multa')}
          </div>
        </fieldset>
        {actual && <p className="ayuda">Cambiar los precios no modifica lo que ya deben los inscritos.</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="botones">
          <button className="btn" disabled={ocupado}>{ocupado ? 'Guardando…' : actual ? 'Guardar' : 'Abrir la lista'}</button>
        </div>
      </form>

      {actual && (borrando ? (
        <div className="item-comentario">
          ¿Eliminar esta lista? Se pierden las inscripciones y los pagos marcados.
          <div className="botones chicos">
            <button className="btn chico" disabled={ocupado}
                    onClick={async () => { setOcupado(true); try { await t.eliminar(); ir('/entrenar'); } catch (x) { setError(x.message); setOcupado(false); } }}>
              Sí, eliminar
            </button>
            <button className="btn chico secundario" onClick={() => setBorrando(false)}>Cancelar</button>
          </div>
        </div>
      ) : (
        <p className="ayuda abajo"><button className="enlace" onClick={() => setBorrando(true)}>Eliminar esta lista</button></p>
      ))}
    </>
  );
}
