import { useEffect } from 'react';
import { useSesion } from '../lib/sesion.jsx';
import { ESCUDO } from '../lib/base.js';

// Cuando no se pudo preguntar quién eres (sin señal, Supabase caído). No es lo
// mismo que no estar en la nómina, así que no se manda a buscar el nombre.
export default function SinConexion() {
  const { reintentar, salir, esDemo } = useSesion();

  // Si vuelve la señal, prueba sola.
  useEffect(() => {
    if (esDemo) return undefined;
    window.addEventListener('online', reintentar);
    return () => window.removeEventListener('online', reintentar);
  }, [reintentar, esDemo]);

  return (
    <div className="ingreso">
      <img className="escudo" src={ESCUDO} alt="Escudo del Club Hugo Jara" />
      <h1 className="titulo display">No pudimos conectar</h1>
      <p className="subtitulo">
        No logramos hablar con el club. Revisa tu señal o tu wifi e intenta de nuevo; no tienes que volver a pedir ingreso.
      </p>
      <button className="btn" onClick={() => !esDemo && reintentar()}>Reintentar</button>
      <button className="btn secundario" onClick={() => !esDemo && salir()}>Entrar con otra cuenta</button>
    </div>
  );
}
