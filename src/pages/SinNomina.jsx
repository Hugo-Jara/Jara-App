import { useSesion } from '../lib/sesion.jsx';
import { ESCUDO } from '../lib/base.js';

export default function SinNomina() {
  const { sesion, salir } = useSesion();
  return (
    <div className="ingreso">
      <img className="escudo" src={ESCUDO} alt="Escudo del Club Hugo Jara" />
      <h1 className="titulo display">Tu correo no está en la nómina</h1>
      <p className="subtitulo">
        Entraste con <strong>{sesion?.user?.email}</strong>, pero ese correo no figura entre los
        integrantes del club. Si eres del club, pídele a tu tesorero o a la directiva que lo agreguen
        y vuelve a entrar.
      </p>
      <button className="btn secundario" onClick={salir}>Entrar con otro correo</button>
    </div>
  );
}
