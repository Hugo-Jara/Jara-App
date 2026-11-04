import { useState } from 'react';
import FormClave from './FormClave.jsx';

// Tarjeta de Más: crear o cambiar la contraseña con que se entra.
export default function MiClave() {
  const [abierta, setAbierta] = useState(false);
  const [lista, setLista] = useState(false);
  return (
    <div className="card mi-clave">
      <div className="seccion" style={{ marginTop: 0 }}>Mi contraseña</div>
      {lista && <p className="exito" role="status">Listo. Desde ahora puedes entrar con tu correo y esta contraseña.</p>}
      {abierta ? (
        <FormClave alGuardar={() => { setAbierta(false); setLista(true); }} />
      ) : (
        <>
          <p className="subtitulo" style={{ marginBottom: 12 }}>
            Para entrar con tu correo y una contraseña, sin esperar un link. Si ya tienes una, aquí la cambias.
          </p>
          <button className="btn secundario" onClick={() => { setAbierta(true); setLista(false); }}>
            Crear o cambiar contraseña
          </button>
        </>
      )}
    </div>
  );
}
