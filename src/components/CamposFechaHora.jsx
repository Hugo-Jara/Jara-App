import { useEffect, useRef, useState } from 'react';

// Campos de fecha y hora que se pueden escribir con el teclado numérico del
// celular: los separadores ("/" y ":") aparecen solos mientras escribes, así no
// hay que buscarlos en el teclado. La fecha también se puede elegir en el
// calendario (claro) y ambas tienen botones con sugerencias.

const soloDigitos = (t) => t.replace(/\D/g, '');

// ---------------------------------------------------------------------------
// Fecha: se escribe "22102026" y se ve "22/10/2026". Entrega "2026-10-22".
// ---------------------------------------------------------------------------
const isoATexto = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

const mascaraFecha = (digitos) => {
  const d = digitos.slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
};

// "22/10/2026" → "2026-10-22", o null si no es una fecha que exista.
const textoAIso = (texto) => {
  const d = soloDigitos(texto);
  if (d.length !== 8) return null;
  const [dia, mes, anio] = [Number(d.slice(0, 2)), Number(d.slice(2, 4)), Number(d.slice(4))];
  const f = new Date(anio, mes - 1, dia);
  if (anio < 2000 || f.getFullYear() !== anio || f.getMonth() !== mes - 1 || f.getDate() !== dia) return null;
  return `${d.slice(4)}-${d.slice(2, 4)}-${d.slice(0, 2)}`;
};

export function CampoFecha({ id, valor, alCambiar, sugeridas = [], textoSugerida = (f) => f, requerido }) {
  const [texto, setTexto] = useState(isoATexto(valor));
  const calendario = useRef(null);

  // Si la fecha cambia desde afuera (un botón sugerido, el calendario), se muestra.
  useEffect(() => {
    if (valor !== textoAIso(texto)) setTexto(isoATexto(valor));
  }, [valor]); // eslint-disable-line react-hooks/exhaustive-deps

  const escribir = (e) => {
    const nuevo = mascaraFecha(soloDigitos(e.target.value));
    setTexto(nuevo);
    alCambiar(textoAIso(nuevo) ?? '');
  };
  const abrirCalendario = () => {
    const el = calendario.current;
    if (!el) return;
    try { el.showPicker(); } catch { el.focus(); el.click(); }
  };
  const completa = soloDigitos(texto).length === 8;

  return (
    <>
      <div className="campo-con-boton">
        <input id={id} inputMode="numeric" autoComplete="off" placeholder="dd/mm/aaaa" maxLength={10}
               required={requerido} value={texto} onChange={escribir}
               aria-invalid={completa && !textoAIso(texto)} />
        <button type="button" className="boton-calendario" onClick={abrirCalendario} aria-label="Elegir en el calendario">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
               strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 10h18M8 3v4M16 3v4" />
          </svg>
        </button>
        <input ref={calendario} type="date" className="fecha-clara calendario-oculto" tabIndex={-1} aria-hidden="true"
               value={valor || ''} onChange={(e) => alCambiar(e.target.value)} />
      </div>
      {completa && !textoAIso(texto) && <p className="error chico">Esa fecha no existe. Revisa el día y el mes.</p>}
      {sugeridas.length > 0 && (
        <div className="chips sugeridas">
          {sugeridas.map((f) => (
            <button key={f} type="button" className={`chip${valor === f ? ' activo' : ''}`} onClick={() => alCambiar(f)}>
              {textoSugerida(f)}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Hora: se escribe "2030" y se ve "20:30". Si el primer número es 3 o más, se
// entiende que es una hora de un dígito: "830" → "08:30".
// ---------------------------------------------------------------------------
const mascaraHora = (digitos) => {
  let d = digitos;
  if (d.length >= 1 && Number(d[0]) >= 3) d = `0${d}`;
  d = d.slice(0, 4);
  return d.length <= 2 ? (d.length === 2 ? `${d}:` : d) : `${d.slice(0, 2)}:${d.slice(2)}`;
};

export function CampoHora({ id, valor, alCambiar, sugeridas = [], placeholder = 'Ej.: 20:30' }) {
  const escribir = (e) => {
    const crudo = e.target.value;
    // Al borrar, que el ":" no estorbe: si se borró justo el separador, se quita también el número de antes.
    const borrando = crudo.length < valor.length;
    let digitos = soloDigitos(crudo);
    if (borrando && valor.endsWith(':') && !crudo.endsWith(':')) digitos = digitos.slice(0, -1);
    alCambiar(borrando && digitos.length === 2 ? digitos : mascaraHora(digitos));
  };
  return (
    <>
      <input id={id} inputMode="numeric" autoComplete="off" placeholder={placeholder} maxLength={5}
             value={valor} onChange={escribir} />
      {sugeridas.length > 0 && (
        <div className="chips sugeridas">
          {sugeridas.map((h) => (
            <button key={h} type="button" className={`chip${valor === h ? ' activo' : ''}`} onClick={() => alCambiar(h)}>{h}</button>
          ))}
        </div>
      )}
    </>
  );
}
