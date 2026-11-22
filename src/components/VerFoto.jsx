import { useEffect, useRef } from 'react';

// La foto de perfil en grande, a pantalla completa. Se cierra con ✕, tocando
// fuera de la foto o con Escape.
export default function VerFoto({ url, nombre, apodo, onCerrar }) {
  const cerrar = useRef(null);
  useEffect(() => {
    cerrar.current?.focus();
    const tecla = (e) => { if (e.key === 'Escape') onCerrar(); };
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', tecla);
    return () => { window.removeEventListener('keydown', tecla); document.body.style.overflow = antes; };
  }, [onCerrar]);
  return (
    <div className="visor ver-foto" role="dialog" aria-modal="true" aria-label={`Foto de ${nombre}`}
         onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div className="visor-barra">
        <span>{nombre}{apodo && <span className="apodo"> · {apodo}</span>}</span>
        <button ref={cerrar} type="button" className="visor-cerrar" onClick={onCerrar} aria-label="Cerrar">✕</button>
      </div>
      <div className="ver-foto-centro" onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
        <img className="ver-foto-img" src={url} alt={`Foto de ${nombre}`} />
      </div>
    </div>
  );
}
