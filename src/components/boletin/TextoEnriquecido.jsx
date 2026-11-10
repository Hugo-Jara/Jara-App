import { useEffect, useRef } from 'react';
import { dividirFormato, extraerTexto } from '../../lib/boletinFormato.js';

// El navegador mantiene la selección y el teclado; solo se guardan texto y marcas seguras.
export function TextoFormateado({ texto, formatos }) {
  return dividirFormato(texto, formatos).map((t, i) => <span key={i} style={{ fontWeight: t.negrita ? 'bold' : undefined, fontStyle: t.cursiva ? 'italic' : undefined, textDecoration: t.subrayado ? 'underline' : undefined }}>{t.texto}</span>);
}
export default function TextoEnriquecido({ nota, cambiar, etiqueta = 'Texto de la noticia' }) {
  const editor = useRef(null), rango = useRef(null);
  useEffect(() => {
    const el = editor.current;
    el.replaceChildren();
    for (const tramo of dividirFormato(nota.texto, nota.formatos)) {
      const span = document.createElement('span'); span.textContent = tramo.texto;
      if (tramo.negrita) span.style.fontWeight = 'bold';
      if (tramo.cursiva) span.style.fontStyle = 'italic';
      if (tramo.subrayado) span.style.textDecorationLine = 'underline';
      el.appendChild(span);
    }
  }, []);
  const actualizar = () => { const datos = extraerTexto(editor.current); cambiar(n => ({ ...n, ...datos })); };
  const guardarSeleccion = () => {
    const seleccion = window.getSelection();
    if (seleccion?.rangeCount && editor.current?.contains(seleccion.anchorNode) && editor.current?.contains(seleccion.focusNode)) rango.current = seleccion.getRangeAt(0).cloneRange();
  };
  useEffect(() => { document.addEventListener('selectionchange', guardarSeleccion); return () => document.removeEventListener('selectionchange', guardarSeleccion); }, []);
  const formato = comando => {
    if (!rango.current) return;
    editor.current.focus(); const seleccion = window.getSelection(); seleccion.removeAllRanges(); seleccion.addRange(rango.current);
    document.execCommand(comando, false); guardarSeleccion(); actualizar();
  };
  const pegar = e => {
    e.preventDefault(); const texto = e.clipboardData.getData('text/plain');
    const seleccion = window.getSelection(); if (!seleccion?.rangeCount) return;
    const r = seleccion.getRangeAt(0); r.deleteContents(); const nodo = document.createTextNode(texto); r.insertNode(nodo);
    r.setStartAfter(nodo); r.collapse(true); seleccion.removeAllRanges(); seleccion.addRange(r); guardarSeleccion(); actualizar();
  };
  return <div className="noticias-texto-editor">
    <span className="noticias-campo-etiqueta">{etiqueta}</span>
    <div className="noticias-formato" role="toolbar" aria-label="Formato del texto">
      {[['bold','Negrita','N'],['italic','Cursiva','C'],['underline','Subrayado','S']].map(([cmd,nombre,letra]) => <button type="button" key={cmd} onPointerDown={e => e.preventDefault()} onClick={() => formato(cmd)} aria-label={nombre} title={nombre}>{letra}</button>)}
      <small>Selecciona texto para darle formato.</small>
    </div>
    <div ref={editor} role="textbox" aria-label={etiqueta} aria-multiline="true" className="noticias-texto-editable" contentEditable suppressContentEditableWarning spellCheck lang="es-CL" onInput={actualizar} onKeyUp={guardarSeleccion} onPointerUp={guardarSeleccion} onBlur={guardarSeleccion} onPaste={pegar} />
  </div>;
}
