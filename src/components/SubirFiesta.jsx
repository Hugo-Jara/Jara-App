import { useRef, useState } from 'react';
import { useSesion } from '../lib/sesion.jsx';
import { revisar, subirVarios, fiestaAbierta } from '../lib/fiesta.js';
import { plural } from '../lib/texto.js';

// Botón para elegir varias fotos y videos a la vez y subirlos de a uno,
// mostrando el avance. Al terminar llama a listo().
export default function SubirFiesta({ listo, secundario = false }) {
  const { persona } = useSesion();
  const input = useRef(null);
  const [avance, setAvance] = useState(null); // { i, total }
  const [resultado, setResultado] = useState(null); // { subidos, fuera: [{nombre, motivo}] }

  if (!fiestaAbierta()) return <p className="nota" style={{ textAlign: 'left' }}>Ya se cerró la subida. La galería se puede seguir mirando unos días más.</p>;

  const elegir = async (e) => {
    const archivos = [...(e.target.files ?? [])];
    e.target.value = '';
    if (!archivos.length) return;
    setResultado(null);
    const { ok, fuera } = revisar(archivos);
    let fallados = [];
    if (ok.length) {
      fallados = await subirVarios(persona, ok, (i, total) => setAvance(i < total ? { i, total } : null));
    }
    setAvance(null);
    setResultado({ subidos: ok.length - fallados.length, fuera: [...fuera, ...fallados] });
    listo?.();
  };

  return (
    <div className="fiesta-subir">
      <input ref={input} type="file" accept="image/*,video/*" multiple hidden onChange={elegir} />
      <button className={`btn${secundario ? ' secundario' : ''}`} disabled={!!avance} onClick={() => input.current?.click()}>
        {avance ? `Subiendo ${avance.i + 1} de ${avance.total}…` : 'Subir fotos y videos'}
      </button>
      {avance && (
        <>
          <div className="fiesta-barra" role="progressbar" aria-valuemin={0} aria-valuemax={avance.total} aria-valuenow={avance.i}>
            <span style={{ width: `${Math.round((avance.i / avance.total) * 100)}%` }} />
          </div>
          <p className="nota" style={{ textAlign: 'left' }}>No cierres la app hasta que termine. Los videos se demoran más.</p>
        </>
      )}
      {resultado && (
        <div role="status" className="fiesta-resultado">
          {resultado.subidos > 0 && <p className="respuesta">¡Listo! {plural(resultado.subidos, 'archivo subido', 'archivos subidos')}. Gracias por compartir.</p>}
          {resultado.fuera.length > 0 && (
            <div className="error">
              {resultado.fuera.length === 1 ? 'Uno no se pudo subir:' : `${resultado.fuera.length} no se pudieron subir:`}
              <ul>{resultado.fuera.slice(0, 6).map((f, i) => <li key={i}>{f.nombre}: {f.motivo}.</li>)}</ul>
              {resultado.fuera.length > 6 && <p>…y {resultado.fuera.length - 6} más.</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
