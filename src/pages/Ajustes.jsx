import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSesion } from '../lib/sesion.jsx';
import { TEMAS, LETRAS, leerAjustes, guardarAjuste } from '../lib/ajustes.js';
import Icono from '../components/Icono.jsx';
import MiClave from '../components/MiClave.jsx';

// Avisos que vendrán cuando la app pueda mandar notificaciones al teléfono.
const AVISOS = [
  { nombre: 'Inscribirme al partido', desc: 'Si se acerca el partido y no has dicho si vas' },
  { nombre: 'Fotos nuevas', desc: 'Cuando llegan fotos de un partido en que apareces' },
  { nombre: 'La liga', desc: 'Cuando se actualizan los resultados o la tabla' },
  { nombre: 'El Jara Informa', desc: 'Cuando sale un boletín nuevo' },
];

// Botones de a uno para elegir entre pocas opciones (tema, letra).
function Opciones({ etiqueta, opciones, valor, alElegir }) {
  return (
    <div className="ajustes-opciones" role="radiogroup" aria-label={etiqueta}>
      {opciones.map((o) => (
        <button key={o.valor} type="button" role="radio" aria-checked={valor === o.valor}
                className={valor === o.valor ? 'activa' : ''} onClick={() => alElegir(o.valor)}>
          {o.nombre}
        </button>
      ))}
    </div>
  );
}

export default function Ajustes() {
  const { sesion, esDemo, salir } = useSesion();
  const [ajustes, setAjustes] = useState(leerAjustes);
  const [confirmarSalida, setConfirmarSalida] = useState(false);
  const elegir = (nombre) => (valor) => setAjustes(guardarAjuste(nombre, valor));

  const usuario = sesion?.user;
  const proveedores = usuario?.app_metadata?.providers || [usuario?.app_metadata?.provider].filter(Boolean);
  const conGoogle = proveedores.includes('google') && !proveedores.includes('email');

  return (
    <>
      <h1 className="titulo display">Ajustes</h1>
      <p className="subtitulo">Tu cuenta y cómo se ve la app en este teléfono.</p>

      <div className="seccion">Mi cuenta</div>
      <div className="card lista">
        <Link to="/perfil" className="fila">
          <div className="modulo-icono"><Icono nombre="jugadores" /></div>
          <div className="modulo-cuerpo">
            <div className="modulo-nombre">Mi perfil</div>
            <div className="modulo-desc">Tu foto, apodo, dorsal, posición y pie hábil</div>
          </div>
          <Icono nombre="flecha" size={18} />
        </Link>
      </div>
      {usuario?.email && <p className="ajustes-correo">Entraste como <strong>{usuario.email}</strong></p>}

      <div className="seccion">Contraseña</div>
      <MiClave conGoogle={conGoogle} />

      <div className="seccion">Pantalla</div>
      <div className="card">
        <div className="ajustes-rotulo">Tema</div>
        <Opciones etiqueta="Tema" opciones={TEMAS} valor={ajustes.tema} alElegir={elegir('tema')} />
        <p className="ajustes-ayuda">"Como el teléfono" cambia solo cuando tu teléfono pasa a modo oscuro o claro.</p>
        <div className="ajustes-rotulo" style={{ marginTop: 20 }}>Tamaño de letra</div>
        <Opciones etiqueta="Tamaño de letra" opciones={LETRAS} valor={ajustes.letra} alElegir={elegir('letra')} />
        <p className="ajustes-ayuda">Agranda todo: letras, botones y fotos.</p>
      </div>

      <div className="seccion">Notificaciones</div>
      <div className="card ajustes-avisos">
        <p className="aviso-demo" style={{ marginTop: 0 }}>
          Muy pronto. Cuando estén listas, la app te podrá avisar al teléfono y aquí eliges cuáles quieres recibir.
        </p>
        {AVISOS.map((a) => (
          <label key={a.nombre} className="ajustes-aviso">
            <span className="modulo-cuerpo">
              <span className="modulo-nombre">{a.nombre}</span>
              <span className="modulo-desc">{a.desc}</span>
            </span>
            <input type="checkbox" role="switch" className="interruptor" disabled />
          </label>
        ))}
      </div>

      {!esDemo && (
        <>
          <div className="seccion">Sesión</div>
          <div className="card">
            {confirmarSalida ? (
              <>
                <p className="subtitulo" style={{ marginBottom: 12 }}>
                  Vas a salir de la app en este teléfono. Para volver a entrar necesitas tu correo, tu contraseña o Google.
                </p>
                <button className="btn" onClick={salir}>Sí, cerrar sesión</button>
                <button className="btn secundario" style={{ marginTop: 10 }} onClick={() => setConfirmarSalida(false)}>Cancelar</button>
              </>
            ) : (
              <button className="btn secundario ajustes-salir" onClick={() => setConfirmarSalida(true)}>
                <Icono nombre="salir" size={20} /> Cerrar sesión
              </button>
            )}
          </div>
        </>
      )}
    </>
  );
}
