import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { esDemo } from '../lib/supabase.js';
import { estadoCaras, activarCaras, apagarCaras, misFotos, noSoyYo, mostrarEnPerfil, subirSelfie, quitarSelfie, urlSelfie } from '../lib/caras.js';
import EncuadrarFoto from './EncuadrarFoto.jsx';
import { fuente, otraVez, Visor } from './FotosDelPartido.jsx';
import { fechaLarga } from '../lib/fechas.js';
import { plural } from '../lib/texto.js';

const PRIMERAS = 9;

// Perfil > Mis fotos: "Buscarme en las fotos" (0042). Se activa con permiso,
// usa la foto de perfil (o una selfie solo para buscarse, 0059) y se apaga
// cuando quieras (borra todo).
export default function MisFotos({ tieneFoto, personaId }) {
  const [estado, setEstado] = useState(null);
  const [fotos, setFotos] = useState(null);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [abriendo, setAbriendo] = useState(false);
  const [mayor, setMayor] = useState(false);
  const [mostrar, setMostrar] = useState(true);
  const [todas, setTodas] = useState(false);
  const [abierta, setAbierta] = useState(null);
  const [porEncuadrar, setPorEncuadrar] = useState(null);
  const [selfieUrl, setSelfieUrl] = useState(null);
  const pedirSelfie = useRef(null);

  // silencioso: las revisiones de fondo no muestran error (el celular corta la
  // red cuando la pantalla se apaga o la app queda atrás).
  const cargar = async (silencioso = false) => {
    try {
      const e = await estadoCaras();
      const f = e.activa ? await misFotos() : null;
      setEstado(e);
      setFotos(f);
      setError('');
    } catch (x) { if (!silencioso) setError(x.message); }
  };
  useEffect(() => { cargar(); }, [tieneFoto]); // eslint-disable-line react-hooks/exhaustive-deps
  // La miniatura de la selfie (solo la ve uno mismo).
  useEffect(() => {
    let vivo = true;
    if (estado?.selfie_ruta) urlSelfie(estado.selfie_ruta).then((u) => { if (vivo) setSelfieUrl(u); }).catch(() => {});
    else setSelfieUrl(null);
    return () => { vivo = false; };
  }, [estado?.selfie_ruta]);
  // Mientras está pendiente, se vuelve a mirar cada minuto, solo con la app a la vista.
  useEffect(() => {
    if (estado?.activa && estado.estado === 'pendiente') {
      const t = setInterval(() => { if (document.visibilityState === 'visible') cargar(true); }, esDemo ? 5000 : 60000);
      return () => clearInterval(t);
    }
  }, [estado]); // eslint-disable-line react-hooks/exhaustive-deps

  const hacer = (accion) => async () => {
    setOcupado(true); setError('');
    try { await accion(); await cargar(); setAbriendo(false); setMayor(false); }
    catch (x) { setError(x.message); }
    setOcupado(false);
  };
  const apagar = () => {
    if (!window.confirm('¿Dejar de buscarte en las fotos? Se borra tu huella de la cara y todas las fotos encontradas.')) return;
    hacer(apagarCaras)();
  };
  const elegirSelfie = (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (archivo) { setError(''); setPorEncuadrar(archivo); }
  };
  const subirEncuadrada = (recorte) => {
    const archivo = porEncuadrar;
    setPorEncuadrar(null);
    hacer(() => subirSelfie(personaId, archivo, recorte))();
  };
  const sacarSelfie = () => {
    if (!window.confirm('¿Quitar tu selfie? Te volvemos a buscar con tu foto de perfil.')) return;
    hacer(quitarSelfie)();
  };
  const esconder = async (foto) => {
    try {
      await noSoyYo(foto.id);
      setAbierta(null);
      setFotos((f) => f.filter((x) => x.id !== foto.id));
    } catch (x) { setError(x.message); }
  };

  if (!estado) {
    return (
      <div className="card perfil-fotos">
        <div className="item-que">Mis fotos</div>
        {error ? <p className="error" role="alert">{error}</p> : <p className="item-meta">Cargando…</p>}
      </div>
    );
  }

  // Apagado: explicar y pedir permiso.
  if (!estado.activa) {
    return (
      <div className="card perfil-fotos">
        <div className="item-que">Mis fotos</div>
        <p className="item-meta">
          La app puede buscarte en las fotos que el fotógrafo de la liga sube de cada partido, comparando tu cara con tu foto de perfil. Si en tu foto de perfil no se te ve la cara, después de activarlo puedes subir una selfie solo para buscarte.
        </p>
        {!abriendo ? (
          <button type="button" className="btn secundario" style={{ marginTop: 14 }} onClick={() => setAbriendo(true)}>
            Buscarme en las fotos
          </button>
        ) : (
          <div className="caras-permiso">
            <p className="item-meta">Antes de activarlo, lo importante:</p>
            <ul className="caras-lista">
              <li>Se saca una huella de tu cara (una lista de números) desde tu foto de perfil, o desde una selfie si la subes, y se compara con las fotos de la liga.</li>
              <li>Solo se guarda en qué fotos sales. De las demás caras no se guarda nada.</li>
              <li>Tú eliges si tus fotos encontradas se ven en tu perfil para el resto del club o si solo las ves tú. Lo cambias cuando quieras.</li>
              <li>Lo apagas cuando quieras y se borra todo al tiro.</li>
            </ul>
            {!tieneFoto && <p className="item-meta">No tienes foto de perfil: después de activarlo, sube una selfie para que te busquemos.</p>}
            <label className="casilla">
              <input type="checkbox" checked={mayor} onChange={(e) => setMayor(e.target.checked)} />
              Tengo 18 años o más y acepto que me busquen en las fotos
            </label>
            <label className="casilla">
              <input type="checkbox" checked={mostrar} onChange={(e) => setMostrar(e.target.checked)} />
              Mostrar en mi perfil las fotos donde salgo
            </label>
            {error && <p className="error" role="alert">{error}</p>}
            <div className="caras-botones">
              <button type="button" className="btn" disabled={!mayor || ocupado} onClick={hacer(async () => { await activarCaras(mayor); if (mostrar) await mostrarEnPerfil(true); })}>
                {ocupado ? 'Activando…' : 'Activar'}
              </button>
              <button type="button" className="enlace" onClick={() => { setAbriendo(false); setMayor(false); setError(''); }}>Ahora no</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const visibles = fotos ? (todas ? fotos : fotos.slice(0, PRIMERAS)) : [];
  const aviso = {
    pendiente: 'Te estamos buscando. La búsqueda corre sola cada media hora y la primera tarda unos 30 minutos: vuelve más tarde.',
    sin_cara: estado.con_selfie
      ? 'No encontramos una cara clara en tu selfie. Sube otra de frente y con buena luz.'
      : 'No encontramos una cara clara en tu foto de perfil. Sube una selfie solo para buscarte (tu foto de perfil no cambia).',
    sin_foto: 'Quitaste tu foto de perfil: pon una o sube una selfie para que te sigamos buscando.',
  }[estado.estado];

  return (
    <div className="card perfil-fotos">
      <div className="item-que">Mis fotos{fotos?.length ? ` · ${fotos.length}` : ''}</div>
      {aviso && <p className="item-meta">{aviso}</p>}
      {estado.foto_cambio && estado.estado === 'lista' && <p className="item-meta">{estado.con_selfie ? 'Subiste una selfie' : 'Cambiaste tu foto'}: en la próxima búsqueda te buscamos con la nueva.</p>}
      {estado.estado === 'lista' && fotos?.length === 0 && (
        <p className="item-meta">Todavía no apareces en las fotos de la liga. Cuando suban fotos nuevas te volvemos a buscar.</p>
      )}
      <div className="caras-selfie">
        {estado.con_selfie ? (
          <>
            {selfieUrl && <img className="caras-selfie-foto" src={selfieUrl} alt="Tu selfie para buscarte" />}
            <p className="item-meta">
              Te buscamos con tu selfie. Solo la ves tú.{' '}
              <button type="button" className="enlace" disabled={ocupado} onClick={() => pedirSelfie.current?.click()}>Cambiarla</button>
              {' · '}<button type="button" className="enlace quitar" disabled={ocupado} onClick={sacarSelfie}>Quitarla</button>
            </p>
          </>
        ) : (
          <p className="item-meta">
            ¿No te encuentra o en tu foto de perfil no se te ve la cara?{' '}
            <button type="button" className={estado.estado === 'sin_cara' || estado.estado === 'sin_foto' ? 'btn secundario caras-selfie-btn' : 'enlace'}
              disabled={ocupado} onClick={() => pedirSelfie.current?.click()}>
              {ocupado ? 'Subiendo…' : 'Sube una selfie solo para buscarte'}
            </button>
          </p>
        )}
        <input ref={pedirSelfie} type="file" accept="image/jpeg,image/png,image/webp,image/heic" hidden onChange={elegirSelfie} />
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {fotos?.length > 0 && (
        <div className="fotos-grilla" style={{ marginTop: 12 }}>
          {visibles.map((f, i) => (
            <button key={f.id} className="fotos-miniatura" onClick={() => setAbierta(i)} aria-label={`Ver foto ${i + 1}`}>
              <img src={fuente(f.id, 400)} onError={otraVez(f.id, 400)} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
      {fotos?.length > PRIMERAS && !todas && (
        <button className="btn secundario" style={{ marginTop: 12 }} onClick={() => setTodas(true)}>Ver las {plural(fotos.length, 'foto', 'fotos')}</button>
      )}
      <p className="nota" style={{ textAlign: 'left' }}>
        {estado.muestra ? 'Se ven en tu perfil para el resto del club' : 'Solo tú ves tus fotos'}
        {' · '}<button type="button" className="enlace" disabled={ocupado} onClick={hacer(() => mostrarEnPerfil(!estado.muestra))}>
          {estado.muestra ? 'Ocultarlas' : 'Mostrarlas en mi perfil'}
        </button>
      </p>
      <p className="nota" style={{ textAlign: 'left' }}>
        Buscarme en las fotos está activado · <button type="button" className="enlace quitar" disabled={ocupado} onClick={apagar}>Apagar y borrar</button>
      </p>
      {porEncuadrar && <EncuadrarFoto archivo={porEncuadrar} onListo={subirEncuadrada} onCancelar={() => setPorEncuadrar(null)} />}
      {abierta != null && fotos?.[abierta] && (
        <Visor
          fotos={fotos} indice={abierta} cambiar={setAbierta} cerrar={() => setAbierta(null)}
          extra={(f) => (
            <span className="caras-visor-dato">
              {f.partidoId
                ? <Link className="enlace" to={`/partidos/${f.partidoId}`}>{f.equipo} vs {f.rival}{f.partidoFecha ? ` · ${fechaLarga(f.partidoFecha)}` : ''}</Link>
                : <span>{f.carpetaNombre}</span>}
              {' · '}<button type="button" className="enlace quitar" onClick={() => esconder(f)}>No soy yo</button>
            </span>
          )}
        />
      )}
    </div>
  );
}
