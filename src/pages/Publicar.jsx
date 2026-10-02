import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useNoticias, TIPOS, PLANTILLA_ENTREVISTA, siguienteNumeroBoletin } from '../lib/noticias.js';
import { Foto } from '../components/Carrusel.jsx';

// Selector de fotos: muestra las elegidas y deja quitar una.
function Fotos({ fotos, onChange, etiqueta = 'Fotos' }) {
  const agregar = (e) => {
    const nuevas = [...e.target.files].map((f) => ({ src: URL.createObjectURL(f) }));
    onChange([...fotos, ...nuevas]);
    e.target.value = '';
  };
  return (
    <div className="campo">
      <span className="campo-etiqueta">{etiqueta}</span>
      <div className="fotos-elegidas">
        {fotos.map((f, i) => (
          <button type="button" key={i} className="foto-elegida" aria-label={`Quitar foto ${i + 1}`}
                  onClick={() => onChange(fotos.filter((_, j) => j !== i))}>
            <Foto foto={f} /><span aria-hidden="true">×</span>
          </button>
        ))}
        <label className="foto-agregar">
          + Agregar
          <input type="file" accept="image/*" multiple hidden onChange={agregar} />
        </label>
      </div>
    </div>
  );
}

function FormBoletin({ numero, onPublicar }) {
  const [bajada, setBajada] = useState('');
  const [notas, setNotas] = useState([{ titulo: '', texto: '', fotos: [] }]);
  const cambiar = (i, campo, valor) => setNotas(notas.map((n, j) => (j === i ? { ...n, [campo]: valor } : n)));
  const enviar = (e) => {
    e.preventDefault();
    onPublicar({ tipo: 'boletin', titulo: `El Jara Informa N°${numero}`, bajada, notas });
  };
  return (
    <form onSubmit={enviar}>
      <p className="ayuda">Esta edición será <strong>El Jara Informa N°{numero}</strong>.</p>
      <label htmlFor="bajada">Resumen de la edición</label>
      <input id="bajada" required value={bajada} onChange={(e) => setBajada(e.target.value)}
             placeholder="Lo más importante, en una línea" />
      {notas.map((n, i) => (
        <fieldset className="bloque" key={i}>
          <legend>Nota {i + 1}</legend>
          <label htmlFor={`t${i}`}>Título</label>
          <input id={`t${i}`} required value={n.titulo} onChange={(e) => cambiar(i, 'titulo', e.target.value)} />
          <label htmlFor={`x${i}`}>Texto</label>
          <textarea id={`x${i}`} rows="4" required value={n.texto} onChange={(e) => cambiar(i, 'texto', e.target.value)} />
          <Fotos fotos={n.fotos} onChange={(f) => cambiar(i, 'fotos', f)} />
          {notas.length > 1 && (
            <button type="button" className="enlace" onClick={() => setNotas(notas.filter((_, j) => j !== i))}>
              Quitar esta nota
            </button>
          )}
        </fieldset>
      ))}
      <button type="button" className="btn secundario" onClick={() => setNotas([...notas, { titulo: '', texto: '', fotos: [] }])}>
        Agregar otra nota
      </button>
      <button className="btn publicar">Publicar boletín</button>
    </form>
  );
}

function FormEntrevista({ onPublicar }) {
  const [nombre, setNombre] = useState('');
  const [fotos, setFotos] = useState([]);
  const [ficha, setFicha] = useState({});
  const [respuestas, setRespuestas] = useState({});
  const enviar = (e) => {
    e.preventDefault();
    onPublicar({
      tipo: 'entrevista',
      titulo: `Cortita y al pie: ${nombre}`,
      bajada: [ficha['Posición'], ficha['Serie']].filter(Boolean).join(' · '),
      fotos,
      ficha: PLANTILLA_ENTREVISTA.ficha.filter((c) => ficha[c]).map((c) => [c, ficha[c]]),
      // Las preguntas sin respuesta no se publican.
      secciones: PLANTILLA_ENTREVISTA.secciones
        .map((s) => ({ titulo: s.titulo, preguntas: s.preguntas.filter((q) => respuestas[q]).map((q) => [q, respuestas[q]]) }))
        .filter((s) => s.preguntas.length),
    });
  };
  return (
    <form onSubmit={enviar}>
      <label htmlFor="nombre">Jugador</label>
      <input id="nombre" required value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre y apellido" />
      <Fotos fotos={fotos} onChange={setFotos} />
      <fieldset className="bloque">
        <legend>Presentación</legend>
        {PLANTILLA_ENTREVISTA.ficha.map((c) => (
          <div key={c}>
            <label htmlFor={c}>{c}</label>
            <input id={c} value={ficha[c] || ''} onChange={(e) => setFicha({ ...ficha, [c]: e.target.value })} />
          </div>
        ))}
      </fieldset>
      {PLANTILLA_ENTREVISTA.secciones.map((s) => (
        <fieldset className="bloque" key={s.titulo}>
          <legend>{s.titulo}</legend>
          {s.preguntas.map((q) => (
            <div key={q}>
              <label htmlFor={q}>{q}</label>
              <input id={q} value={respuestas[q] || ''} onChange={(e) => setRespuestas({ ...respuestas, [q]: e.target.value })} />
            </div>
          ))}
        </fieldset>
      ))}
      <button className="btn publicar">Publicar entrevista</button>
    </form>
  );
}

function FormAviso({ onPublicar }) {
  const [d, setD] = useState({ titulo: '', texto: '', vence: '', fotos: [] });
  const set = (campo) => (e) => setD({ ...d, [campo]: e.target.value });
  const enviar = (e) => {
    e.preventDefault();
    onPublicar({ tipo: 'aviso', titulo: d.titulo, bajada: d.texto.split('\n')[0], texto: d.texto, vence: d.vence, fotos: d.fotos });
  };
  return (
    <form onSubmit={enviar}>
      <label htmlFor="titulo">Título</label>
      <input id="titulo" required value={d.titulo} onChange={set('titulo')} placeholder="Qué se anuncia" />
      <label htmlFor="texto">Texto</label>
      <textarea id="texto" rows="4" required value={d.texto} onChange={set('texto')} />
      <label htmlFor="vence">Plazo (opcional)</label>
      <input id="vence" value={d.vence} onChange={set('vence')} placeholder="Hasta el 5 de octubre" />
      <Fotos fotos={d.fotos} onChange={(f) => setD({ ...d, fotos: f })} etiqueta="Imagen o afiche" />
      <button className="btn publicar">Publicar aviso</button>
    </form>
  );
}

export default function Publicar() {
  const { publicaciones, publicar, puedePublicar } = useNoticias();
  const [tipo, setTipo] = useState('boletin');
  const ir = useNavigate();

  if (!puedePublicar) {
    return (
      <>
        <Link to="/noticias" className="volver">← Noticias</Link>
        <p className="vacio suelto">Solo la Secretaría de Comunicaciones puede publicar.</p>
      </>
    );
  }
  const alPublicar = (p) => ir(`/noticias/${publicar(p)}`);
  return (
    <>
      <Link to="/noticias" className="volver">← Noticias</Link>
      <h1 className="titulo display">Publicar</h1>
      <p className="subtitulo">Llena los campos y la app arma la publicación.</p>
      <div className="filtros" role="tablist" aria-label="Qué vas a publicar">
        {Object.entries(TIPOS).map(([clave, texto]) => (
          <button key={clave} role="tab" aria-selected={tipo === clave}
                  className={`filtro ${tipo === clave ? 'activo' : ''}`} onClick={() => setTipo(clave)}>
            {texto}
          </button>
        ))}
      </div>
      <div className="card">
        {tipo === 'boletin' && <FormBoletin numero={siguienteNumeroBoletin(publicaciones)} onPublicar={alPublicar} />}
        {tipo === 'entrevista' && <FormEntrevista onPublicar={alPublicar} />}
        {tipo === 'aviso' && <FormAviso onPublicar={alPublicar} />}
      </div>
    </>
  );
}
