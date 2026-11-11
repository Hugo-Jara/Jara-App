import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useSesion } from '../lib/sesion.jsx';
import {
  POSICIONES, POSICIONES_TECNICAS, esTecnico, PIES, nombrePosicion, limpiarInstagram, nombrePie, textoCumple,
  leerPerfil, guardarPerfil, urlsDeFotos, subirMiFoto, quitarMiFoto,
} from '../lib/perfil.js';
import FotoJugador from '../components/FotoJugador.jsx';
import MisFotos from '../components/MisFotos.jsx';
import FotosDelJugador from '../components/FotosDelJugador.jsx';
import EstadisticasJugador from '../components/EstadisticasJugador.jsx';
import EstadisticasDT from '../components/EstadisticasDT.jsx';

// /perfil es el mío; /perfil/:id el de otro. Cada uno edita su foto, apodo,
// dorsal, posición, pie, fecha de nacimiento, estatura y peso. El tesorero y el
// encargado del plantel pueden cargar dorsal, posición y pie. Nombre, celular y
// correo los cambia el tesorero o Hacienda desde Tesorería.
export default function Perfil() {
  const { id } = useParams();
  const { persona } = useSesion();
  const navigate = useNavigate();
  const location = useLocation();
  const [perfil, setPerfil] = useState(null);
  const [foto, setFoto] = useState(null);
  const [error, setError] = useState('');
  const [editando, setEditando] = useState(false);
  const pedirFoto = useRef(null);
  const [fotoEstado, setFotoEstado] = useState({ ocupado: false, error: '' });

  const cargar = async () => {
    setError('');
    try {
      const p = await leerPerfil(id && id !== persona.id ? id : null);
      setPerfil(p);
      setFoto(p.foto_ruta ? (await urlsDeFotos([p.foto_ruta]))[p.foto_ruta] : null);
    } catch (e) { setError(e.message); }
  };
  useEffect(() => { setPerfil(null); setEditando(false); cargar(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const elegirFoto = async (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    setFotoEstado({ ocupado: true, error: '' });
    try {
      const { url } = await subirMiFoto(perfil.id, archivo);
      setFoto(url);
      setFotoEstado({ ocupado: false, error: '' });
    } catch (err) { setFotoEstado({ ocupado: false, error: err.message }); }
  };
  const quitarFoto = async () => {
    setFotoEstado({ ocupado: true, error: '' });
    try { await quitarMiFoto(); setFoto(null); setFotoEstado({ ocupado: false, error: '' }); }
    catch (err) { setFotoEstado({ ocupado: false, error: err.message }); }
  };

  // Si se llegó desde otra pantalla (estadísticas, un partido), vuelve a ella.
  const volver = id && location.key !== 'default'
    ? <button type="button" className="volver enlace-volver" onClick={() => navigate(-1)}>‹ Volver</button>
    : <Link to={id ? '/planteles' : '/mas'} className="volver">‹ {id ? 'Planteles' : 'Más'}</Link>;
  if (error) return <>{volver}<p className="error" role="alert">{error}</p></>;
  if (!perfil) return <>{volver}<p className="vacio suelto">Cargando…</p></>;

  // DT y ayudante técnico (0048): sus planteles como cuerpo técnico y su
  // récord; lo de jugador (pie, dorsal) solo si lo tiene.
  const tecnico = esTecnico(perfil);
  const rolTecnico = POSICIONES_TECNICAS.includes(perfil.posicion) ? nombrePosicion(perfil.posicion) : 'Cuerpo técnico';
  const dirige = tecnico ? (perfil.dirige?.length ? perfil.dirige : perfil.planteles) : [];
  const etiquetas = [
    ...dirige.map((e) => ({ id: `t-${e.id}`, texto: `${rolTecnico} · ${e.nombre}` })),
    ...perfil.planteles.filter((e) => !tecnico || e.dorsal || !dirige.some((x) => x.id === e.id))
      .map((e) => ({ id: e.id, texto: `${e.dorsal ? `#${e.dorsal} · ` : ''}${e.nombre}` })),
  ];
  const datos = [
    [tecnico ? 'Rol' : 'Posición', tecnico ? rolTecnico : nombrePosicion(perfil.posicion)],
    ['Pie hábil', !tecnico && nombrePie(perfil.pie)],
    ['Cumpleaños', textoCumple(perfil.cumple)],
    ['Estatura', perfil.estatura_cm && `${(perfil.estatura_cm / 100).toFixed(2).replace('.', ',')} m`],
    ['Peso', perfil.peso_kg && `${perfil.peso_kg} kg`],
    ['Instagram', perfil.instagram && (
      <a href={`https://www.instagram.com/${perfil.instagram}/`} target="_blank" rel="noopener noreferrer">@{perfil.instagram}</a>
    )],
  ].filter(([, v]) => v);

  return (
    <>
      {volver}
      <div className="perfil-cabeza">
        <FotoJugador nombre={perfil.nombre} url={foto} tamano={112} />
        <h1 className="titulo display perfil-nombre">{perfil.nombre}</h1>
        {perfil.apodo && <p className="apodo perfil-apodo">{perfil.apodo}</p>}
        {etiquetas.length > 0 && (
          <div className="perfil-planteles">
            {etiquetas.map((e) => <span key={e.id} className="etiqueta">{e.texto}</span>)}
          </div>
        )}
        {perfil.propio && (
          <div className="perfil-foto-botones">
            <input ref={pedirFoto} type="file" accept="image/jpeg,image/png,image/webp,image/heic" hidden onChange={elegirFoto} />
            <button type="button" className="btn chico secundario" disabled={fotoEstado.ocupado} onClick={() => pedirFoto.current?.click()}>
              {fotoEstado.ocupado ? 'Subiendo…' : foto ? 'Cambiar foto' : 'Poner foto'}
            </button>
            {foto && !fotoEstado.ocupado && <button type="button" className="enlace" onClick={quitarFoto}>Quitar</button>}
          </div>
        )}
        {fotoEstado.error && <p className="error" role="alert">{fotoEstado.error}</p>}
      </div>

      {!editando && (
        <div className="card">
          {datos.length > 0 ? (
            <dl className="perfil-datos">
              {datos.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
            </dl>
          ) : (
            <p className="vacio">{perfil.propio ? 'Todavía no completas tu perfil.' : 'Todavía no completa su perfil.'}</p>
          )}
          {perfil.puedo_cargar && (
            <button type="button" className="btn secundario" style={{ marginTop: 16 }} onClick={() => setEditando(true)}>
              {perfil.propio ? 'Editar mi perfil' : tecnico ? 'Cargar su rol' : 'Cargar dorsal, posición y pie'}
            </button>
          )}
        </div>
      )}

      {/* Sus números del club: partidos, goles, asistencias, jugador del partido. */}
      {/* Al DT: su récord como DT y, si además jugó, sus números de jugador. */}
      {!editando && tecnico && <EstadisticasDT perfil={perfil} />}
      {!editando && <EstadisticasJugador perfil={perfil} soloSiJugo={tecnico} />}

      {editando && (
        <Editor perfil={perfil} onListo={async () => { setEditando(false); await cargar(); }} onCancelar={() => setEditando(false)} />
      )}

      {/* Buscarme en las fotos (0042, 0045): las de otro jugador, solo si él eligió mostrarlas. */}
      {perfil.propio ? <MisFotos tieneFoto={!!foto} /> : <FotosDelJugador personaId={perfil.id} />}

      {perfil.propio && (
        <div className="card">
          <div className="item-que">Tus datos del club</div>
          <dl className="perfil-datos">
            <div><dt>Nombre</dt><dd>{perfil.nombre}</dd></div>
            <div><dt>Celular</dt><dd>{perfil.telefono || '—'}</dd></div>
            <div><dt>Correo</dt><dd>{perfil.correo || '—'}</dd></div>
          </dl>
          <p className="item-meta" style={{ marginTop: 10 }}>Estos los cambia tu tesorero o Hacienda. Si algo está mal, avísales.</p>
        </div>
      )}
    </>
  );
}

function Editor({ perfil, onListo, onCancelar }) {
  const propio = perfil.propio;
  const [f, setF] = useState(() => ({
    apodo: perfil.apodo ?? '',
    instagram: perfil.instagram ?? '',
    posicion: perfil.posicion ?? '',
    pie: perfil.pie ?? '',
    nacimiento: perfil.nacimiento ?? '',
    estatura_cm: perfil.estatura_cm ?? '',
    peso_kg: perfil.peso_kg ?? '',
    muestra_fisico: !!perfil.muestra_fisico,
    dorsales: Object.fromEntries(perfil.planteles.map((e) => [e.id, e.dorsal ?? ''])),
  }));
  const [estado, setEstado] = useState({ ocupado: false, error: '' });
  const poner = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const tecnico = POSICIONES_TECNICAS.includes(f.posicion);
  const chipsPosicion = (lista) => lista.map(([k, t]) => (
    <button key={k} type="button" role="radio" aria-checked={f.posicion === k}
            className={`chip ${f.posicion === k ? 'activo' : ''}`} onClick={() => poner('posicion', f.posicion === k ? '' : k)}>{t}</button>
  ));

  const guardar = async (e) => {
    e.preventDefault();
    const cambios = {};
    const igual = (a, b) => String(a ?? '') === String(b ?? '');
    const campos = propio ? ['apodo', 'posicion', 'pie', 'nacimiento', 'estatura_cm', 'peso_kg'] : ['posicion', 'pie'];
    campos.forEach((k) => { if (!igual(f[k], perfil[k])) cambios[k] = String(f[k]).trim() || null; });
    if (propio && !igual(limpiarInstagram(f.instagram), perfil.instagram)) cambios.instagram = limpiarInstagram(f.instagram);
    if (propio && f.muestra_fisico !== !!perfil.muestra_fisico) cambios.muestra_fisico = f.muestra_fisico;
    const dorsales = {};
    perfil.planteles.forEach((p) => { if (!igual(f.dorsales[p.id], p.dorsal)) dorsales[p.id] = f.dorsales[p.id] === '' ? null : Number(f.dorsales[p.id]); });
    if (Object.keys(dorsales).length) cambios.dorsales = dorsales;
    if (!Object.keys(cambios).length) { onCancelar(); return; }
    setEstado({ ocupado: true, error: '' });
    try { await guardarPerfil(perfil, cambios); await onListo(); }
    catch (err) { setEstado({ ocupado: false, error: err.message }); }
  };

  return (
    <form className="card" onSubmit={guardar}>
      <div className="item-que">{propio ? 'Editar mi perfil' : `Perfil de ${perfil.nombre}`}</div>

      {propio && (
        <label className="campo">
          <span className="campo-etiqueta">Apodo (opcional, sale chico al lado de tu nombre)</span>
          <input maxLength={20} placeholder="Ej: el Checho" value={f.apodo} onChange={(e) => poner('apodo', e.target.value)} />
        </label>
      )}

      {propio && (
        <div className="campo">
          <label className="campo-etiqueta" htmlFor="perfil-instagram">Instagram (opcional, tu usuario o el link a tu perfil)</label>
          <div className="perfil-instagram">
            <input id="perfil-instagram" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={80} placeholder="@tu.usuario"
                   value={f.instagram} onChange={(e) => poner('instagram', e.target.value)} />
            {/* Abre la cuenta en Instagram para confirmar que es la tuya antes de guardar. */}
            <a className={`btn chico secundario ${limpiarInstagram(f.instagram) ? '' : 'apagado'}`}
               aria-disabled={!limpiarInstagram(f.instagram)}
               href={limpiarInstagram(f.instagram) ? `https://www.instagram.com/${limpiarInstagram(f.instagram)}/` : undefined}
               target="_blank" rel="noopener noreferrer">Comprobar</a>
          </div>
          {limpiarInstagram(f.instagram) && (
            <p className="item-meta">Toca Comprobar: si se abre tu cuenta, está bien escrito. Se guardará como @{limpiarInstagram(f.instagram)}.</p>
          )}
        </div>
      )}

      {perfil.planteles.length > 0 && !tecnico && (
        <div className="campo">
          <span className="campo-etiqueta">Dorsal</span>
          <div className="perfil-dorsales">
            {perfil.planteles.map((p) => (
              <label key={p.id}>
                <span>{p.nombre}</span>
                <input type="number" inputMode="numeric" min={1} max={99} placeholder="—"
                       value={f.dorsales[p.id]} onChange={(e) => setF((x) => ({ ...x, dorsales: { ...x.dorsales, [p.id]: e.target.value } }))} />
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="campo">
        <span className="campo-etiqueta">Posición</span>
        <div className="chips" role="radiogroup" aria-label="Posición" style={{ marginTop: 0 }}>
          {chipsPosicion(POSICIONES.filter(([k]) => !POSICIONES_TECNICAS.includes(k)))}
        </div>
        <span className="campo-etiqueta" style={{ marginTop: 12 }}>Cuerpo técnico</span>
        <div className="chips" role="radiogroup" aria-label="Cuerpo técnico" style={{ marginTop: 0 }}>
          {chipsPosicion(POSICIONES.filter(([k]) => POSICIONES_TECNICAS.includes(k)))}
        </div>
        {tecnico && <p className="item-meta" style={{ marginTop: 8 }}>En el perfil sale su récord como DT. Si algún día juega, sus números de jugador aparecen aparte.</p>}
      </div>

      {!tecnico && <div className="campo">
        <span className="campo-etiqueta">Pie hábil</span>
        <div className="segmentos" role="radiogroup" aria-label="Pie hábil">
          {PIES.map(([k, t]) => (
            <button key={k} type="button" role="radio" aria-checked={f.pie === k}
                    className={`segmento ${f.pie === k ? 'activo duda' : ''}`} onClick={() => poner('pie', f.pie === k ? '' : k)}>{t}</button>
          ))}
        </div>
      </div>}

      {propio && (
        <>
          <label className="campo">
            <span className="campo-etiqueta">Fecha de nacimiento (el club ve solo el día y el mes; tu tesorero, la fecha completa para la liga)</span>
            <input type="date" className="fecha-clara" value={f.nacimiento} onChange={(e) => poner('nacimiento', e.target.value)} />
          </label>
          <div className="perfil-fisico">
            <label className="campo">
              <span className="campo-etiqueta">Estatura (cm)</span>
              <input type="number" inputMode="numeric" min={120} max={230} placeholder="Ej: 175" value={f.estatura_cm} onChange={(e) => poner('estatura_cm', e.target.value)} />
            </label>
            <label className="campo">
              <span className="campo-etiqueta">Peso (kg)</span>
              <input type="number" inputMode="numeric" min={35} max={200} placeholder="Ej: 78" value={f.peso_kg} onChange={(e) => poner('peso_kg', e.target.value)} />
            </label>
          </div>
          <label className="perfil-check">
            <input type="checkbox" checked={f.muestra_fisico} onChange={(e) => poner('muestra_fisico', e.target.checked)} />
            <span>Mostrar estatura y peso al resto del club</span>
          </label>
        </>
      )}

      {estado.error && <p className="error" role="alert">{estado.error}</p>}
      <div className="botones" style={{ marginTop: 18 }}>
        <button type="button" className="btn secundario" onClick={onCancelar} disabled={estado.ocupado}>Cancelar</button>
        <button className="btn" disabled={estado.ocupado}>{estado.ocupado ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </form>
  );
}
