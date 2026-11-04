import { useSesion } from '../lib/sesion.jsx';
import { ESCUDO } from '../lib/base.js';
import FormClave from '../components/FormClave.jsx';

// Aparece justo después de entrar con link o código: ofrece dejar una
// contraseña para no tener que pedir un correo la próxima vez.
export default function ElegirClave() {
  const { noOfrecerClave, sesion } = useSesion();
  const correo = sesion?.user?.email;
  return (
    <div className="ingreso">
      <img className="escudo" src={ESCUDO} alt="Escudo del Club Hugo Jara" />
      <h1 className="titulo display">¿Dejamos una contraseña?</h1>
      <p className="subtitulo">
        Así la próxima vez entras con {correo ? <strong>{correo}</strong> : 'tu correo'} y tu contraseña, sin esperar un link.
      </p>
      <div className="card">
        <FormClave alGuardar={noOfrecerClave} textoBoton="Guardar y entrar" />
      </div>
      <button type="button" className="enlace" style={{ display: 'block', margin: '18px auto 0' }} onClick={noOfrecerClave}>
        Ahora no
      </button>
      <p className="nota">Si algún día se te olvida, pide un link o código y aquí mismo eliges otra.</p>
    </div>
  );
}
