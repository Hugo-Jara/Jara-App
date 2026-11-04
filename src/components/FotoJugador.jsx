// La foto del jugador en un círculo; sin foto, sus iniciales.
export default function FotoJugador({ nombre = '', url, tamano = 44 }) {
  const iniciales = nombre.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
  return (
    <span className="perfil-foto" style={{ width: tamano, height: tamano, fontSize: tamano * 0.38 }} aria-hidden="true">
      {url ? <img src={url} alt="" loading="lazy" /> : iniciales}
    </span>
  );
}
