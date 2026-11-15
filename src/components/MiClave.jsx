import { useState } from 'react';
import FormClave from './FormClave.jsx';

// Ajustes > Contraseña: crear o cambiar la contraseña con que se entra.
// Quien entra con Google no tiene contraseña y no la necesita; igual puede crear una
// para entrar también con su correo.
export default function MiClave({ conGoogle = false }) {
  const [abierta, setAbierta] = useState(false);
  const [lista, setLista] = useState(false);
  return (
    <div className="card mi-clave">
      {lista && <p className="exito" role="status" style={{ marginTop: 0 }}>Listo. Desde ahora puedes entrar con tu correo y esta contraseña.</p>}
      {abierta ? (
        <>
          <FormClave alGuardar={() => { setAbierta(false); setLista(true); }} />
          <button className="btn secundario" style={{ marginTop: 10 }} onClick={() => setAbierta(false)}>Cancelar</button>
        </>
      ) : (
        <>
          <p className="subtitulo" style={{ marginBottom: 12 }}>
            {conGoogle
              ? 'Entras con tu cuenta de Google, así que no necesitas contraseña. Si quieres, puedes crear una para entrar también con tu correo, sin Google.'
              : 'Para entrar con tu correo y una contraseña, sin esperar un link. Si ya tienes una, aquí la cambias.'}
          </p>
          <button className="btn secundario" onClick={() => { setAbierta(true); setLista(false); }}>
            {conGoogle ? 'Crear una contraseña' : 'Crear o cambiar contraseña'}
          </button>
        </>
      )}
    </div>
  );
}
