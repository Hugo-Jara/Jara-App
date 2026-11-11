import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
// Contrato de la app con RPC/Storage simulado; no usa credenciales ni datos del club.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', '5181', '--strictPort'], { env: { ...process.env, VITE_BASE: '/' }, stdio: ['ignore','pipe','pipe'] });
await new Promise((resolve, reject) => { server.stdout.on('data', d => { if (String(d).includes('localhost')) resolve(); }); server.once('exit', () => reject(new Error('No partió Vite'))); });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
try {
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  const errors = []; page.on('pageerror', e => (errors.push(e.message), console.error(e.message)));
  await page.route('**/src/lib/sesion.jsx', r => r.fulfill({ contentType: 'text/javascript', body: 'export const useSesion = () => ({ persona: {id:"inventada", esAdmin:true} });' }));
  await page.route('**/src/lib/supabase.js', r => r.fulfill({ contentType: 'text/javascript', body: `
    export const esDemo = false;
    window.llamadas = []; window.ediciones = []; window.archivos = {}; window.fallar = false;
    export async function llamar(fn,p={}) {
      window.llamadas.push([fn,structuredClone(p)]);
      const lista = window.ediciones; let e = lista.find(e=>e.id===p.p_id);
      if(fn==='boletin_catalogo') return structuredClone(lista);
      if(fn==='boletin_ultima') return structuredClone(lista.filter(e=>e.estado==='publicada').sort((a,b)=>b.numero-a.numero)[0]||null);
      if(fn==='boletin_edicion') return structuredClone(e);
      if(fn==='boletin_guardar'||fn==='boletin_crear_historica') {
        if(!e) {e={id:p.p_id,estado:'borrador',version:0,paginas:0,origen:fn==='boletin_guardar'?'editor':'historica'};lista.push(e);}
        Object.assign(e,{numero:p.p_numero,titulo:p.p_titulo,resumen:p.p_resumen,fecha_edicion:p.p_fecha,contenido:p.p_contenido});
      }
      if(fn==='boletin_publicar') { for(let i=1;i<=p.p_paginas;i++) if(!window.archivos[p.p_id+'/v'+p.p_version+'/pagina-'+String(i).padStart(2,'0')+'.png']) throw Error('Falta página'); Object.assign(e,{estado:'publicada',version:p.p_version,paginas:p.p_paginas,carpeta:p.p_id+'/v'+p.p_version,contenido_publicado:structuredClone(e.contenido)}); }
      if(fn==='boletin_retirar') e.estado='retirada';
      if(fn==='boletin_eliminar') window.ediciones=lista.filter(x=>x!==e);
      return structuredClone(e);
    }
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
    export const supabase={storage:{from:()=>({
      upload:async(path,blob)=>{window.llamadas.push(['upload',path]); if(window.fallar) return {error:{message:'Subida interrumpida'}};window.archivos[path]=blob;return {data:{path}};},
      download:async(path)=>({data:window.archivos[path]}),
      createSignedUrl:async()=>({data:{signedUrl:png}}),
      list:async(prefix)=>({data:Object.keys(window.archivos).filter(p=>p.startsWith(prefix+'/')).map(p=>p.slice(prefix.length+1)).filter(p=>!p.includes('/')).map(name=>({id:name,name})).concat([...new Set(Object.keys(window.archivos).filter(p=>p.startsWith(prefix+'/')).map(p=>p.slice(prefix.length+1).split('/')).filter(p=>p.length>1).map(p=>p[0]))].map(name=>({name}))) }),
      remove:async(paths)=>{paths.forEach(p=>delete window.archivos[p]);return {data:[]};}
    })}};
  ` }));
  mkdirSync('work', {recursive:true});
  writeFileSync('work/boletin-publicacion-harness.jsx', `import React from 'react'; import {createRoot} from 'react-dom/client'; import {BrowserRouter} from 'react-router-dom'; import BoletinReal from '../src/components/boletin/BoletinReal.jsx'; import '../src/styles.css'; createRoot(document.getElementById('root')).render(<BrowserRouter><BoletinReal /></BrowserRouter>);`);
  await page.route('**/prueba-boletin*', r => r.fulfill({ contentType:'text/html', body:`<div id="root"></div><script type="module">import RefreshRuntime from "/@react-refresh"; RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/work/boletin-publicacion-harness.jsx"></script>` }));
  await page.goto('http://localhost:5181/prueba-boletin?editor=1');
  await page.getByRole('button',{name:'Crear nuevo boletín'}).click();
  await page.getByRole('button',{name:'+ Noticias en dos columnas'}).click();
  await page.getByLabel('Título de la sección (opcional)').fill('Sección de ejemplo');
  await page.getByLabel('Titular',{exact:true}).first().fill('Noticia inventada');
  await page.getByRole('button',{name:'Guardar borrador',exact:true}).click();
  await page.getByText('Borrador guardado',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.llamadas.some(([fn])=>fn==='boletin_publicar')),false);
  await page.evaluate(()=>window.fallar=true);
  await page.getByRole('button',{name:'Publicar edición',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Subida interrumpida'}).waitFor();
  assert.equal(await page.evaluate(()=>window.ediciones[0].estado),'borrador');
  await page.evaluate(()=>window.fallar=false);
  await page.getByRole('button',{name:'Publicar edición',exact:true}).click();
  await page.getByText('Edición publicada',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.ediciones[0].version),1);
  await page.getByRole('button',{name:'Vista previa y PNG'}).click();
  await page.getByRole('button',{name:'Lectura móvil',exact:true}).click();
  const tamanos = await page.evaluate(()=>[parseFloat(getComputedStyle(document.querySelector('.noticias-introduccion-lectura h3')).fontSize),parseFloat(getComputedStyle(document.querySelector('.noticias-lectura article h3')).fontSize)]);
  assert(tamanos[0]>tamanos[1]);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=375));
  await page.getByRole('button',{name:'← Guardar y volver a borradores'}).click();
  await page.getByRole('button',{name:'Retirar edición'}).click();
  await page.getByText('retirada ·',{exact:false}).waitFor();
  await page.getByRole('button',{name:'Continuar edición'}).click();
  await page.getByRole('button',{name:'Publicar edición',exact:true}).click();
  await page.getByText('Edición publicada',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.ediciones[0].version),2);
  await page.getByRole('button',{name:'← Guardar y volver a borradores'}).click();
  await page.getByRole('button',{name:'Retirar edición'}).click();
  await page.getByRole('button',{name:'Eliminar edición'}).waitFor();
  page.once('dialog',d=>d.accept('999'));
  await page.getByRole('button',{name:'Eliminar edición'}).click();
  await page.getByRole('alert').filter({hasText:'El número no coincide'}).waitFor();
  assert.equal(await page.evaluate(()=>window.ediciones.length),1);
  page.once('dialog',d=>d.accept('1'));
  await page.getByRole('button',{name:'Eliminar edición'}).click();
  await page.waitForFunction(()=>window.ediciones.length===0);
  await page.getByRole('button',{name:'Subir edición anterior',exact:true}).click();
  const png = await page.evaluate(()=>{const c=document.createElement('canvas');c.width=64;c.height=80;return c.toDataURL().split(',')[1];});
  await page.getByLabel('Páginas PNG',{exact:true}).setInputFiles([{name:'pagina-10.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')},{name:'pagina-2.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')}]);
  assert((await page.locator('ol li').first().textContent()).startsWith('pagina-2.png'));
  await page.getByRole('button',{name:'↓ Bajar página 1'}).click();
  assert((await page.locator('ol li').first().textContent()).startsWith('pagina-10.png'));
  await page.getByRole('button',{name:'Publicar edición',exact:true}).click();
  await page.getByRole('button',{name:'Retirar edición'}).waitFor();
  assert.equal(await page.evaluate(()=>window.ediciones[0].paginas),2);
  await page.getByRole('button',{name:'Retirar edición'}).click();
  await page.getByRole('button',{name:'Volver a publicar'}).click();
  await page.getByRole('button',{name:'Retirar edición'}).waitFor();
  assert.equal(await page.evaluate(()=>window.ediciones[0].version),2);
  await page.getByRole('link',{name:'Ver catálogo',exact:true}).click();
  await page.getByRole('link',{name:'Leer edición'}).click();
  await page.getByAltText('Página 1 de la edición 1',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Siguiente →',exact:true}).click();
  await page.getByAltText('Página 2 de la edición 1',{exact:true}).waitFor();
  const ultima = await page.evaluate(async()=>{const api=await import('/src/lib/boletin.js');return api.ultimaEdicion();});
  assert.equal(ultima.numero,1);
  assert.deepEqual(errors,[]);
  console.log('OK: PNG históricos en orden, catálogo, lector e Inicio; guardar sin publicar, fallo de subida, publicación, jerarquía móvil, retirar, republicar y eliminar con número.');
} finally { await browser.close(); server.kill(); unlinkSync('work/boletin-publicacion-harness.jsx'); }
