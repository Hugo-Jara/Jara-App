import { useState } from 'react';
import { useSesion } from '../lib/sesion.jsx';
import { ESCUDO } from '../lib/base.js';

export default function Ingreso() {
  const { entrarConGoogle, entrarConCorreo, esDemo } = useSesion();
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState('');

  const conGoogle = async () => {
    if (esDemo) return;
    setError('');
    const { error } = await entrarConGoogle();
    if (error) setError('No se pudo abrir el ingreso con Google. Intenta de nuevo.');
  };

  const conCorreo = async (e) => {
    e.preventDefault();
    if (esDemo) return;
    setError('');
    setEnviando(true);
    const { error } = await entrarConCorreo(email);
    setEnviando(false);
    if (error) setError('No pudimos enviar el link. Revisa el correo e intenta de nuevo en unos minutos.');
    else setEnviado(true);
  };

  return (
    <div className="ingreso">
      <img className="escudo" src={ESCUDO} alt="Escudo del Club Hugo Jara" />
      <h1 className="titulo display">Jara App</h1>
      <p className="subtitulo">Club Deportivo Hugo Jara</p>

      <div className="card">
        <button className="btn claro" onClick={conGoogle}>
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.840H9v3.480h4.840a4.140 4.140 0 0 1-1.800 2.720v2.260h2.920c1.700-1.570 2.680-3.880 2.680-6.620z" />
            <path fill="#34A853" d="M9 18c2.430 0 4.470-.800 5.960-2.180l-2.920-2.260c-.800.540-1.840.860-3.040.860-2.340 0-4.330-1.580-5.040-3.710H.960v2.330A9 9 0 0 0 9 18z" />
            <path fill="#FBBC05" d="M3.960 10.710a5.410 5.410 0 0 1 0-3.420V4.960H.960a9 9 0 0 0 0 8.080l3-2.330z" />
            <path fill="#EA4335" d="M9 3.580c1.320 0 2.500.450 3.440 1.350l2.580-2.580C13.460.890 11.430 0 9 0A9 9 0 0 0 .960 4.960l3 2.330C4.670 5.160 6.660 3.580 9 3.580z" />
          </svg>
          Entrar con Google
        </button>

        <div className="separador">o con tu correo</div>

        {enviado ? (
          <p className="exito" role="status">
            Te enviamos un link a <strong>{email}</strong>. Ábrelo en este mismo teléfono para entrar.
          </p>
        ) : (
          <form onSubmit={conCorreo}>
            <label htmlFor="correo">Correo con el que estás en la nómina</label>
            <input id="correo" type="email" inputMode="email" autoComplete="email" required
                   placeholder="nombre@correo.cl" value={email} onChange={(e) => setEmail(e.target.value)} />
            <button className="btn secundario" style={{ marginTop: 14 }} disabled={enviando}>
              {enviando ? 'Enviando…' : 'Enviarme un link'}
            </button>
          </form>
        )}
        {error && <p className="error" role="alert">{error}</p>}
      </div>

      <p className="nota">
        Entra con el mismo correo que le diste al club. No hay contraseña que recordar.
      </p>
    </div>
  );
}
