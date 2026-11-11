import { useState } from 'react';
import { useSesion } from '../lib/sesion.jsx';
import { recordarClave } from '../lib/entrada.js';

export const CLAVE_MINIMA = 8;

// Traduce lo que responde Supabase al cambiar la contraseña.
const errorClave = (error) => {
  if (error.code === 'same_password') return 'Esa ya es tu contraseña. Si quieres cambiarla, elige otra.';
  if (error.code === 'weak_password') return `Esa contraseña es muy débil. Usa al menos ${CLAVE_MINIMA} caracteres, mezclando letras y números.`;
  if (error.code === 'reauthentication_needed') {
    return 'Por seguridad, sal de la app, vuelve a entrar con un link o código y crea la contraseña apenas entres.';
  }
  return 'No pudimos guardar la contraseña. Revisa tu conexión e intenta de nuevo.';
};

// Formulario para crear o cambiar la contraseña de la cuenta con que se entró.
export default function FormClave({ alGuardar, textoBoton = 'Guardar contraseña' }) {
  const { ponerClave, esDemo } = useSesion();
  const [clave, setClave] = useState('');
  const [repetida, setRepetida] = useState('');
  const [ver, setVer] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const guardar = async (e) => {
    e.preventDefault();
    setError('');
    if (clave.length < CLAVE_MINIMA) return setError(`Usa al menos ${CLAVE_MINIMA} caracteres.`);
    if (clave !== repetida) return setError('Las dos contraseñas no son iguales.');
    if (esDemo) return alGuardar?.();
    setGuardando(true);
    const { error } = await ponerClave(clave);
    setGuardando(false);
    if (error) return setError(errorClave(error));
    recordarClave();
    alGuardar?.();
  };

  return (
    <form onSubmit={guardar}>
      <label htmlFor="clave-nueva">Contraseña nueva</label>
      <input id="clave-nueva" type={ver ? 'text' : 'password'} autoComplete="new-password" required
             value={clave} onChange={(e) => setClave(e.target.value)} />
      <label htmlFor="clave-repetida" style={{ marginTop: 12 }}>Repítela</label>
      <input id="clave-repetida" type={ver ? 'text' : 'password'} autoComplete="new-password" required
             value={repetida} onChange={(e) => setRepetida(e.target.value)} />
      <label className="ver-clave">
        <input type="checkbox" checked={ver} onChange={(e) => setVer(e.target.checked)} /> Mostrar contraseña
      </label>
      <p className="ayuda-clave">Al menos {CLAVE_MINIMA} caracteres. Mejor si mezclas letras y números.</p>
      <button className="btn" style={{ marginTop: 14 }} disabled={guardando}>
        {guardando ? 'Guardando…' : textoBoton}
      </button>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  );
}
