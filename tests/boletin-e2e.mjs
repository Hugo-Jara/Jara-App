// Recorrido de El Jara Informa en un navegador real (Chromium), en modo demo.
// Comprueba el editor (fotos que cargan mientras se editan otras), el reemplazo
// del boletín anterior y el lector en tamaños de celular.
//
// Uso:  npm run test:boletin:e2e            (capturas en la carpeta temporal)
//       npm run test:boletin:e2e -- ./capturas
// Requiere Playwright con Chromium, que no es dependencia del proyecto:
//       npm i --no-save playwright && npx playwright install chromium
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { createRequire } from 'node:module';

let playwright;
try { playwright = await import('playwright'); } catch { try { playwright = createRequire(import.meta.url)('playwright'); } catch {
  console.error('Falta Playwright. Instálalo sin tocar package.json:\n  npm i --no-save playwright && npx playwright install chromium');
  process.exit(2);
} }
const { chromium, devices } = playwright;
const salida = resolve(process.argv[2] || join(tmpdir(), 'jara-informa-e2e'));
mkdirSync(salida, { recursive: true });
const PUERTO = 5179, BASE = `http://localhost:${PUERTO}`;

// PNG sintético de un color (sin fotos reales: el repositorio es público).
function png(ancho, alto, [r, g, b]) {
  const crc = buf => { let c, t = -1; for (const byte of buf) { c = (t ^ byte) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t = (t >>> 8) ^ c; } return (t ^ -1) >>> 0; };
  const trozo = (tipo, datos) => { const largo = Buffer.alloc(4); largo.writeUInt32BE(datos.length); const cuerpo = Buffer.concat([Buffer.from(tipo), datos]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(cuerpo)); return Buffer.concat([largo, cuerpo, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(ancho, 0); ihdr.writeUInt32BE(alto, 4); ihdr[8] = 8; ihdr[9] = 2;
  const fila = Buffer.concat([Buffer.from([0]), Buffer.alloc(ancho * 3).map((_, i) => [r, g, b][i % 3])]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), trozo('IHDR', ihdr), trozo('IDAT', deflateSync(Buffer.concat(Array(alto).fill(fila)))), trozo('IEND', Buffer.alloc(0))]);
}
const foto = (nombre, color) => ({ name: nombre, mimeType: 'image/png', buffer: png(640, 480, color) });

const resultados = [];
async function paso(nombre, fn) {
  try { await fn(); resultados.push(['OK', nombre]); console.log(`OK    ${nombre}`); }
  catch (e) { resultados.push(['FALLA', nombre, e.message]); console.log(`FALLA ${nombre}\n      ${e.message.split('\n')[0]}`); }
}
const verificar = (condicion, mensaje) => { if (!condicion) throw new Error(mensaje); };

// Servidor de desarrollo en modo demo (sin credenciales de Supabase).
const env = { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_KEY: '', VITE_BASE: '/' };
const servidor = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(PUERTO), '--strictPort'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((ok, mal) => { const t = setTimeout(() => mal(new Error('Vite no partió en 30 s')), 30000); servidor.stdout.on('data', d => { if (String(d).includes('localhost')) { clearTimeout(t); ok(); } }); });

const navegador = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
const CELULARES = { 'iphone-13': devices['iPhone 13'], 'pixel-7': devices['Pixel 7'] };
try {
  for (const [nombreEquipo, equipo] of Object.entries(CELULARES)) {
    // Chromium con el tamaño, densidad, táctil y user agent de cada celular.
    const { defaultBrowserType, ...perfil } = equipo;
    const contexto = await navegador.newContext({ ...perfil, acceptDownloads: true });
    const page = await contexto.newPage();
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));
    const captura = nombre => page.screenshot({ path: join(salida, `${nombreEquipo}-${nombre}.png`), fullPage: false });
    const sinDesborde = async () => { const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })); verificar(sw <= cw, `desborde horizontal: ${sw}px > ${cw}px`); };
    const p = s => `[${nombreEquipo}] ${s}`;

    await paso(p('Catálogo: la edición N°3 es la última y la N°2 pasa al historial'), async () => {
      await page.goto(`${BASE}/noticias`);
      const ultima = page.locator('h3:has-text("Última edición disponible") + article');
      await ultima.getByRole('heading', { name: 'El Jara Informa N°3' }).waitFor();
      const historial = page.locator('h3:has-text("Historial de ediciones") ~ article');
      verificar(await historial.count() === 1, 'el historial debería tener una sola edición');
      await historial.getByRole('heading', { name: 'El Jara Informa N°2' }).waitFor();
      await page.locator('.noticias-portada').first().waitFor();
      await sinDesborde(); await captura('01-catalogo');
    });

    await paso(p('El boletín anterior ya no aparece: ni en Noticias, ni en Inicio, ni por su enlace viejo'), async () => {
      await page.goto(`${BASE}/noticias`);
      await page.getByRole('tab', { name: 'Todo' }).click();
      verificar(await page.locator('a[href$="/noticias/boletin-2"]').count() === 0, 'Noticias aún enlaza al boletín viejo');
      await page.goto(`${BASE}/`);
      await page.waitForLoadState('networkidle');
      verificar(await page.locator('a[href$="/noticias/boletin-2"]').count() === 0, 'Inicio aún enlaza al boletín viejo');
      await page.goto(`${BASE}/noticias/boletin-2`);
      await page.getByText('Esta publicación ya no está disponible.').waitFor();
      await page.goto(`${BASE}/noticias/nueva`);
      await page.getByRole('heading', { name: 'Mis borradores' }).waitFor();
      verificar(await page.getByRole('button', { name: 'Publicar boletín' }).count() === 0, 'sigue el formulario viejo de boletín');
    });

    await paso(p('Lector: botones, deslizamiento, ampliación y lectura móvil sin desborde'), async () => {
      await page.goto(`${BASE}/noticias?edicion=demo-3`);
      const contador = page.getByText(/^Página \d+ de \d+$/);
      await contador.waitFor({ timeout: 15000 });
      const total = Number((await contador.textContent()).match(/de (\d+)/)[1]);
      verificar(total >= 2, `la edición demo debería tener 2+ páginas, tiene ${total}`);
      await page.locator('.noticias-pagina canvas').waitFor();
      await sinDesborde(); await captura('02-lector-pagina-1');
      await page.getByRole('button', { name: 'Siguiente →' }).click();
      await page.getByText(`Página 2 de ${total}`).waitFor();
      await page.getByRole('button', { name: '← Anterior' }).click();
      await page.getByText(`Página 1 de ${total}`).waitFor();
      // Deslizar con el dedo de derecha a izquierda avanza una página.
      await page.locator('.noticias-visor').evaluate(el => {
        const r = el.getBoundingClientRect(), y = r.top + 40;
        const toque = x => new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
        el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [toque(r.right - 20)], changedTouches: [toque(r.right - 20)] }));
        el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [toque(r.left + 20)] }));
      });
      await page.getByText(`Página 2 de ${total}`).waitFor();
      await captura('03-lector-deslizado');
      await page.getByLabel('Ampliar página').fill('2');
      const ancho = await page.locator('.noticias-visor > div').evaluate(el => el.style.width);
      verificar(ancho === '200%', `la ampliación no cambió el ancho (${ancho})`);
      await sinDesborde(); await captura('04-lector-ampliado');
      await page.getByRole('button', { name: 'Lectura móvil' }).click();
      await page.locator('.noticias-lectura').getByRole('heading', { name: 'Un club que construimos entre todos' }).waitFor();
      await sinDesborde(); await captura('05-lectura-movil');
    });

    await paso(p('Editor: ajustar una foto mientras otra carga no pierde nada y se guarda'), async () => {
      await page.goto(`${BASE}/noticias?editor=1`);
      await page.getByRole('button', { name: 'Crear nuevo boletín' }).click();
      await page.getByRole('button', { name: '+ Noticia breve' }).click();
      const entrada = page.locator('input[type=file][accept^="image/"]').first();
      await entrada.setInputFiles(foto('cancha-a.png', [40, 120, 60]));
      await page.getByLabel('Pie de foto 1').waitFor();
      // A partir de aquí leer cada foto demora 2,5 s, como un archivo grande en un celular.
      await page.evaluate(() => {
        const original = FileReader.prototype.readAsDataURL;
        FileReader.prototype.readAsDataURL = function (archivo) { setTimeout(() => original.call(this, archivo), 2500); };
      });
      await entrada.setInputFiles([foto('cancha-b.png', [160, 40, 30]), foto('cancha-c.png', [30, 60, 160])]);
      await page.getByText('Leyendo fotografías…').waitFor();
      verificar(await page.getByRole('button', { name: '← Guardar y volver a borradores' }).isDisabled(), 'se puede salir del editor con fotos cargando');
      // Mientras cargan B y C: encuadre, zoom y pie de la foto A.
      await page.locator('.noticias-foto-editor').first().locator('summary').click();
      await page.getByLabel('Ampliar fotografía 1').fill('2.5');
      await page.getByLabel('Desplazar horizontalmente 1').fill('15');
      await page.getByLabel('Pie de foto 1').fill('Pie escrito mientras cargaban otras');
      await captura('06-editor-cargando');
      await page.getByLabel('Pie de foto 3').waitFor({ timeout: 15000 });
      await page.getByText('Leyendo fotografías…').waitFor({ state: 'hidden' });
      const leer = async () => ({
        pie: await page.getByLabel('Pie de foto 1').inputValue(),
        zoom: await page.getByLabel('Ampliar fotografía 1').inputValue(),
        x: await page.getByLabel('Desplazar horizontalmente 1').inputValue(),
        fotos: await page.locator('.noticias-foto-editor').count(),
      });
      const antes = await leer();
      verificar(antes.fotos === 3, `deberían quedar 3 fotos, hay ${antes.fotos}`);
      verificar(antes.pie === 'Pie escrito mientras cargaban otras', `se perdió el pie: «${antes.pie}»`);
      verificar(antes.zoom === '2.5' && antes.x === '15', `se perdió el encuadre: zoom ${antes.zoom}, x ${antes.x}`);
      await page.getByText(/^Guardado local/).waitFor({ timeout: 10000 });
      await captura('07-editor-tres-fotos');
      // Recargar y continuar: lo guardado en IndexedDB es lo mismo que se ve.
      await page.goto(`${BASE}/noticias?editor=1`);
      await page.getByRole('button', { name: 'Continuar edición' }).first().click();
      const despues = await leer();
      verificar(JSON.stringify(despues) === JSON.stringify(antes), `tras recargar cambió: ${JSON.stringify(despues)}`);
      await sinDesborde();
    });

    await paso(p('Formato, encuadre y vista previa se conservan en el borrador'), async () => {
      await page.getByLabel('Titular', { exact: true }).first().fill('Noticia de prueba');
      const campo = page.getByRole('textbox', { name: 'Texto de la noticia' }).first();
      await campo.fill('Texto importante para probar.');
      await campo.evaluate(el => {
        const seleccion = window.getSelection(), rango = document.createRange();
        rango.setStart(el.firstChild, 6); rango.setEnd(el.firstChild, 16);
        seleccion.removeAllRanges(); seleccion.addRange(rango);
        document.dispatchEvent(new Event('selectionchange'));
      });
      await page.getByRole('button', { name: 'Negrita' }).first().click();
      await page.getByLabel('Alinear titular').first().selectOption('centro');
      await page.getByLabel('Tamaño del texto').first().selectOption('grande');
      await page.getByLabel('Cómo mostrar la foto').first().selectOption('completa');
      await page.getByText(/^Guardado local/).waitFor({ timeout: 10000 });
      await page.getByRole('button', { name: 'Vista previa y PNG', exact: true }).click();
      await page.locator('.noticias-pagina canvas').waitFor({ timeout: 15000 });
      await sinDesborde();
      await page.getByRole('button', { name: '← Volver a editar', exact: true }).click();
      verificar((await page.getByRole('textbox', { name: 'Texto de la noticia' }).first().textContent()).includes('importante'), 'se perdió el texto');
      verificar(await page.getByLabel('Alinear titular').first().inputValue() === 'centro', 'se perdió la alineación');
      verificar(await page.getByLabel('Cómo mostrar la foto').first().inputValue() === 'completa', 'se perdió el modo de fotografía');
      verificar(await page.locator('.noticias-texto-editable strong, .noticias-texto-editable b, .noticias-texto-editable [style*="bold"]').count() > 0, 'se perdió la negrita');
      await sinDesborde();
    });

    await paso(p('Columnas: agregar, mover y cambiar formato conserva las noticias'), async () => {
      await page.goto(`${BASE}/noticias?editor=1`);
      await page.getByRole('button', { name: 'Crear nuevo boletín' }).click();
      await page.getByRole('button', { name: '+ Noticias en dos columnas' }).click();
      const titulares = page.getByLabel('Titular', { exact: true });
      await titulares.nth(0).fill('Izquierda inicial'); await titulares.nth(1).fill('Derecha inicial');
      await page.getByRole('button', { name: '+ Noticia a la izquierda' }).click();
      await titulares.nth(1).fill('Izquierda adicional');
      await page.getByRole('button', { name: 'Mover a la izquierda' }).click();
      await page.getByLabel('Cambiar formato').first().selectOption('principal');
      await page.getByText(/^Guardado local/).waitFor({ timeout: 10000 });
      await page.goto(`${BASE}/noticias?editor=1`);
      await page.getByRole('button', { name: 'Continuar edición' }).first().click();
      const valores = await page.getByLabel('Titular', { exact: true }).evaluateAll(inputs => inputs.map(i => i.value));
      for (const nombre of ['Izquierda inicial','Derecha inicial','Izquierda adicional']) verificar(valores.includes(nombre), `falta noticia: ${nombre}`);
      await sinDesborde();
    });

    await paso(p('Los borradores locales no aparecen en el catálogo de los socios'), async () => {
      await page.goto(`${BASE}/noticias`);
      await page.locator('h3:has-text("Última edición disponible") + article').getByRole('heading', { name: 'El Jara Informa N°3' }).waitFor();
      verificar(await page.getByRole('heading', { name: 'El Jara Informa N°4' }).count() === 0, 'un borrador apareció en el catálogo');
    });

    await paso(p('Sin errores de JavaScript'), async () => verificar(!errores.length, errores.join(' | ')));
    await contexto.close();
  }
} finally {
  await navegador.close();
  servidor.kill();
}
const fallas = resultados.filter(r => r[0] === 'FALLA');
console.log(`\n${resultados.length - fallas.length} de ${resultados.length} pasos OK. Capturas en ${salida}`);
process.exit(fallas.length ? 1 : 0);
