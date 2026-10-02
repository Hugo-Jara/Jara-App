import { useRef, useState } from 'react';

// Una foto real ({src}) o un recuadro de color para la demostración ({demo: n}).
export function Foto({ foto, className = '' }) {
  if (foto?.src) return <img className={`foto-img ${className}`} src={foto.src} alt={foto.pie || ''} />;
  return <div className={`foto-img foto-${foto?.demo ?? 0} ${className}`} aria-hidden="true" />;
}

// Carrusel que se desliza con el dedo. Muestra "2 / 5" y el pie de la foto visible.
export default function Carrusel({ fotos }) {
  const pista = useRef(null);
  const [actual, setActual] = useState(0);
  if (!fotos?.length) return null;
  const alDeslizar = () => {
    const el = pista.current;
    setActual(Math.round(el.scrollLeft / el.clientWidth));
  };
  return (
    <figure className="carrusel">
      <div className="carrusel-pista" ref={pista} onScroll={alDeslizar}>
        {fotos.map((f, i) => (
          <div className="carrusel-lamina" key={i}><Foto foto={f} /></div>
        ))}
      </div>
      {fotos.length > 1 && <span className="carrusel-cuenta">{actual + 1} / {fotos.length}</span>}
      {fotos[actual]?.pie && <figcaption>{fotos[actual].pie}</figcaption>}
    </figure>
  );
}
