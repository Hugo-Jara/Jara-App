import { useState } from 'react';
import { leerXlsx, pestanaDe, filasDePestana, planDeCuotas } from '../lib/planilla.js';
import { TEMPORADA } from '../lib/tesoreria.js';
import { plural } from '../lib/texto.js';

// Tesorería > Importar planilla (0052). El tesorero sube la planilla común
// (.xlsx), la app lee la pestaña de su plantel y la hoja "Cuotas", muestra qué
// va a cambiar y recién al confirmar lo guarda. La planilla manda.

const ESTADOS = {
  calza: 'Calza',
  nuevo: 'Nuevo',
  duda: 'Duda: no se importa',
  sin_rut: 'No se importa',
  conflicto: 'No se importa',
};
const fechaHora = (iso) => new Date(iso).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export function UltimaImportacion({ importacion }) {
  if (!importacion) return null;
  return (
    <p className="aviso-demo tes-imp-viene">
      Este plantel se lleva en la planilla común. Condición, pagos y cuotas se cambian en la planilla y se vuelven a importar.
      {' '}Última importación: {fechaHora(importacion.hecha_en)}{importacion.por ? `, por ${importacion.por}` : ''}.
    </p>
  );
}

export default function ImportarPlanilla({ plantel, acciones }) {
  const [abierto, setAbierto] = useState(false);
  const [libro, setLibro] = useState(null); // { archivo, hojas, hoja }
  const [pestana, setPestana] = useState('');
  const [envio, setEnvio] = useState(null); // lo que se manda a la base
  const [previa, setPrevia] = useState(null);
  const [bajas, setBajas] = useState([]);
  const [verTodo, setVerTodo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [listo, setListo] = useState('');

  const reiniciar = () => { setLibro(null); setPestana(''); setEnvio(null); setPrevia(null); setBajas([]); setError(''); setVerTodo(false); };

  const revisar = async (lib, nombrePestana) => {
    setOcupado(true); setError(''); setPrevia(null); setBajas([]);
    try {
      const filas = filasDePestana(await lib.hoja(nombrePestana));
      if (!filas.length) throw new Error(`La pestaña "${nombrePestana}" no tiene jugadores`);
      const cuotas = lib.hojas.includes('Cuotas') ? planDeCuotas(await lib.hoja('Cuotas'), plantel, TEMPORADA) : null;
      const datos = { filas, plan: cuotas?.cuotas ?? null, aporte: cuotas?.aporte ?? null, archivo: lib.archivo };
      setEnvio(datos);
      setPrevia(await acciones.importarPlanilla({ ...datos, confirmar: false }));
    } catch (e) {
      setError(e.message);
    } finally {
      setOcupado(false);
    }
  };

  const elegirArchivo = async (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    reiniciar(); setListo('');
    if (!/\.xlsx$/i.test(archivo.name)) {
      setError('Sube la planilla como .xlsx (en Google Sheets: Archivo > Descargar > Microsoft Excel).');
      return;
    }
    setOcupado(true);
    try {
      const l = await leerXlsx(await archivo.arrayBuffer());
      const lib = { archivo: archivo.name, hojas: l.hojas, hoja: l.hoja };
      setLibro(lib);
      const p = pestanaDe(l.hojas, plantel);
      if (!p) {
        setError(`No encontré la pestaña "${plantel}". Elige cuál es.`);
        setOcupado(false);
        return;
      }
      setPestana(p);
      await revisar(lib, p);
    } catch (err) {
      setError(err.message);
      setOcupado(false);
    }
  };

  const confirmar = async () => {
    setOcupado(true); setError('');
    try {
      const r = await acciones.importarPlanilla({ ...envio, bajas, confirmar: true });
      if (!r.confirmado) { setPrevia(r); return; }
      const s = r.resumen;
      setListo(`Listo: ${plural(s.calzan + s.nuevos, 'jugador actualizado', 'jugadores actualizados')}`
        + `${s.nuevos ? `, ${plural(s.nuevos, 'nuevo', 'nuevos')}` : ''}${s.bajas ? `, ${plural(s.bajas, 'baja', 'bajas')}` : ''}.`);
      reiniciar();
      setAbierto(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setOcupado(false);
    }
  };

  if (!abierto) {
    return (
      <>
        {listo && <p className="exito">{listo}</p>}
        <button type="button" className="btn secundario tes-imp-boton" onClick={() => { setAbierto(true); setListo(''); }}>
          Importar planilla
        </button>
      </>
    );
  }

  const s = previa?.resumen;
  const bloqueada = previa?.errores?.length > 0;
  const filasVisibles = (previa?.filas ?? []).filter((f) => verTodo || f.cambios.length || f.avisos.length || f.estado !== 'calza');

  return (
    <section className="card tes-imp">
      <div className="tes-imp-cabeza">
        <h2 className="seccion" style={{ margin: 0 }}>Importar planilla</h2>
        <button type="button" className="enlace" onClick={() => { reiniciar(); setAbierto(false); }}>Cerrar</button>
      </div>
      <p className="item-meta">
        Sube la planilla común como .xlsx. En Google Sheets: Archivo &gt; Descargar &gt; Microsoft Excel. Antes de guardar te muestro qué cambia.
      </p>
      <label className="btn tes-imp-archivo">
        {libro ? 'Elegir otro archivo' : 'Elegir archivo .xlsx'}
        <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={elegirArchivo} disabled={ocupado} hidden />
      </label>
      {libro && (
        <>
          <p className="item-meta">{libro.archivo}</p>
          <label htmlFor="tes-imp-pestana">Pestaña del plantel</label>
          <select id="tes-imp-pestana" value={pestana} disabled={ocupado}
                  onChange={(e) => { setPestana(e.target.value); if (e.target.value) revisar(libro, e.target.value); }}>
            <option value="">Elige la pestaña</option>
            {libro.hojas.filter((h) => !/c[oó]mo llenar|^cuotas$/i.test(h)).map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        </>
      )}
      {ocupado && <p className="item-meta">Revisando…</p>}
      {error && <p className="error">{error}</p>}

      {previa && (
        <>
          {bloqueada && (
            <div className="error tes-imp-errores">
              <strong>Hay que arreglar la planilla antes de importar:</strong>
              <ul>{previa.errores.map((e) => <li key={e}>{e}</li>)}</ul>
            </div>
          )}
          <dl className="total-detalle tes-imp-resumen">
            <div><dt>Calzan</dt><dd>{s.calzan}</dd></div>
            <div><dt>Nuevos</dt><dd>{s.nuevos}</dd></div>
            <div><dt>Con cambios</dt><dd>{s.con_cambios}</dd></div>
            <div><dt>No se importan</dt><dd>{s.no_se_importan}</dd></div>
          </dl>
          {(s.plan_cambia || s.aporte_cambia) && (
            <p className="item-meta">
              {s.plan_cambia ? 'El plan de cuotas cambia según la hoja "Cuotas". ' : ''}
              {s.aporte_cambia ? 'El aporte al club cambia. ' : ''}
            </p>
          )}

          <ul className="tes-imp-filas">
            {filasVisibles.map((f) => (
              <li key={f.fila} className={`tes-imp-fila ${f.estado}`}>
                <div className="tes-imp-fila-cabeza">
                  <span><span className="item-meta">Fila {f.fila} · </span>{f.nombre}</span>
                  <span className={`ef ${f.estado === 'calza' ? 'al_dia' : f.estado === 'nuevo' ? 'pendiente' : 'excedido'}`}>{ESTADOS[f.estado]}</span>
                </div>
                {f.en_app && f.en_app !== f.nombre && <div className="item-meta">En la app: {f.en_app}</div>}
                {f.cambios.length > 0 && <div className="item-meta">{f.cambios.join(' · ')}</div>}
                {f.avisos.map((a) => <div key={a} className="tes-imp-aviso">{a}</div>)}
              </li>
            ))}
            {filasVisibles.length === 0 && <li className="item-meta">Nada cambia: la app ya está igual que la planilla.</li>}
          </ul>
          {!verTodo && filasVisibles.length < previa.filas.length && (
            <button type="button" className="enlace" onClick={() => setVerTodo(true)}>
              Ver las {previa.filas.length} filas
            </button>
          )}

          {previa.fuera.length > 0 && (
            <>
              <h3 className="tes-imp-sub">Ya no están en la planilla</h3>
              <p className="item-meta">Siguen en el plantel. Marca a quienes quieras dar de baja en la tesorería de esta temporada.</p>
              <ul className="tes-imp-filas">
                {previa.fuera.map((p) => (
                  <li key={p.id}>
                    <label className="tes-imp-check">
                      <input type="checkbox" checked={bajas.includes(p.id)}
                             onChange={(e) => setBajas(e.target.checked ? [...bajas, p.id] : bajas.filter((x) => x !== p.id))} />
                      {p.nombre}
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}

          <button type="button" className="btn" style={{ marginTop: 16 }} disabled={ocupado || bloqueada} onClick={confirmar}>
            Confirmar importación
          </button>
        </>
      )}
    </section>
  );
}
