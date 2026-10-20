import { useState } from 'react';
import { useSesion } from '../lib/sesion.jsx';
import { ESCUDO } from '../lib/base.js';
import { supabase } from '../lib/supabase.js';

export default function Ingreso() {
  const { entrarConGoogle, entrarConCorreo, esDemo } = useSesion();
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [verificando, setVerificando] = useState(false);
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

  // La sesión nueva la recoge solo el escuchador de SIGNED_IN en sesion.jsx.
  const conCodigo = async (e) => {
    e.preventDefault();
    if (esDemo) return;
    setError('');
    setVerificando(true);
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: codigo,
      type: 'email',
    });
    setVerificando(false);
    if (error) setError('Ese código no sirve o ya venció. Revísalo o pide uno nuevo.');
  };

  const pedirOtro = () => {
    setEnviado(false);
    setCodigo('');
    setError('');
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
          <form onSubmit={conCodigo}>
            <p className="exito" role="status" style={{ marginTop: 0 }}>
              Te enviamos un correo a <strong>{email}</strong>. Abre el link o escribe aquí el código de 6 dígitos.
            </p>
            <label htmlFor="codigo" style={{ marginTop: 14 }}>Código del correo</label>
            <input id="codigo" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6}
                   required placeholder="123456" value={codigo}
                   onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))} />
            <button className="btn secundario" style={{ marginTop: 14 }} disabled={verificando || codigo.length !== 6}>
              {verificando ? 'Revisando…' : 'Entrar con el código'}
            </button>
            <button type="button" className="enlace" style={{ display: 'block', margin: '14px auto 0' }} onClick={pedirOtro}>
              Usar otro correo o pedir otro código
            </button>
          </form>
        ) : (
          <form onSubmit={conCorreo}>
            <label htmlFor="correo">Tu correo</label>
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
        La primera vez vas a buscar tu nombre en la nómina del club y un encargado de tu plantel te
        da el pase. No hay contraseña que recordar.
      </p>
    </div>
  );
}
