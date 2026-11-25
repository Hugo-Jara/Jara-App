// Ejecutar con Vite en modo demostración, Playwright y Chromium instalados.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.AVISOS_TEST_URL || 'http://127.0.0.1:4175';
const destino = process.argv[2];
if (destino) await mkdir(destino, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] });
const ejemplo = 'Partido suspendido';
const nuevo = 'Horario de prueba';
const contenido = 'El encuentro de demostración comenzará a las 09:30.';

async function deslizar(page, carrusel) {
  const cdp = await page.context().newCDPSession(page);
  const { x, y, width, height } = await carrusel.boundingBox();
  const touch = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
  const punto = (proporcion) => [{ x: Math.round(x + width * proporcion), y: Math.round(y + height / 2) }];
  await touch('touchStart', punto(.88));
  for (const proporcion of [.75, .6, .45, .3, .15]) await touch('touchMove', punto(proporcion));
  await touch('touchEnd', []);
  await cdp.detach();
}

async function probar(perfil) {
  const context = await browser.newContext({
    ...devices[perfil], viewport: { width: 375, height: 812 }, deviceScaleFactor: 1,
    timezoneId: 'America/Santiago', locale: 'es-CL',
  });
  const page = await context.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(e.message));
  const nuevos = page.getByRole('region', { name: 'Avisos nuevos' });
  const leidos = page.getByRole('region', { name: 'Avisos vigentes' });
  const noticias = page.getByRole('region', { name: 'Avisos', exact: true });
  const detalle = page.getByRole('dialog');
  const aviso = (seccion, titulo) => seccion.getByRole('button', { name: new RegExp(titulo) });
  const tarjeta = (titulo) => page.getByRole('article').filter({ has: page.getByRole('heading', { name: titulo, exact: true }) });
  async function nav(ruta) {
    if (ruta === '/noticias') {
      await page.locator('nav a[href="/mas"]').click();
      await page.locator('a[href="/noticias"]').click();
    } else {
      await page.locator(`nav a[href="${ruta}"]`).click();
    }
  }
  const tabAvisos = () => page.getByRole('tab', { name: 'Avisos', exact: true }).click();
  const gestionar = () => noticias.getByRole('link', { name: 'Gestionar avisos' }).click();
  const cerrar = () => detalle.getByRole('button', { name: 'Cerrar' }).click();
  const previa = () => page.getByRole('button', { name: 'Ver vista previa' }).click();

  async function sinDesborde() {
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 375),
      `${perfil}: desborde horizontal en ${page.url()}`);
  }

  async function captura(nombre) {
    await sinDesborde();
    if (destino && perfil === 'iPhone 13') await page.screenshot({ path: join(destino, `${nombre}.png`) });
  }

  try {
    await page.clock.install();
    await page.goto(url);
    await nuevos.getByText('1 de 2').waitFor();
    const saludo = await page.getByRole('heading', { name: /^Hola,/ }).elementHandle();
    const textoSaludo = await saludo.textContent();
    await saludo.evaluate((h) => { h.textContent = 'Hola, socio demo'; });
    await captura('01-carrusel');
    await saludo.evaluate((h, texto) => { h.textContent = texto; }, textoSaludo);
    assert.equal(await leidos.count(), 0);
    const carrusel = nuevos.locator('.avisos-carrusel');
    assert.equal(await carrusel.evaluate((el) => el.scrollWidth === 2 * el.clientWidth), true);
    await deslizar(page, carrusel);
    await nuevos.getByText('2 de 2').waitFor();
    assert.equal(await leidos.count(), 0);
    await nuevos.getByRole('button', { name: 'Aviso anterior' }).click();
    await nuevos.getByText('1 de 2').waitFor();
    await aviso(nuevos, ejemplo).click();
    await detalle.getByText('Se informa que el partido', { exact: false }).waitFor();
    await cerrar();
    await nuevos.getByText('1 de 1').waitFor();
    await leidos.scrollIntoViewIfNeeded();
    await captura('02-aviso-leido');
    assert.equal(await aviso(leidos, ejemplo).count(), 1);
    assert.ok(await leidos.evaluate((el) => el === el.parentElement.lastElementChild));

    await nav('/noticias');
    await tabAvisos();
    await aviso(noticias, ejemplo).waitFor();
    await captura('03-noticias');
    await aviso(noticias, 'Revisa la programación').click();
    await detalle.getByRole('heading', { name: 'Revisa la programación' }).waitFor();
    await cerrar();
    await nav('/');
    await aviso(leidos, 'Revisa la programación').waitFor();
    assert.equal(await nuevos.count(), 0);

    await nav('/noticias');
    await tabAvisos();
    await gestionar();
    await page.getByRole('button', { name: 'Nuevo aviso' }).click();
    assert.equal(await page.getByLabel('Tipo de aviso').locator('option').count(), 5);
    assert.equal(await page.getByLabel('Destinatario').locator('option').count(), 4);
    assert.equal(await page.getByLabel('Vigencia desde la publicación').locator('option').count(), 4);
    await page.getByLabel('Título', { exact: true }).fill(nuevo);
    await page.getByLabel('Mensaje breve').fill(contenido);
    await page.getByLabel('Tipo de aviso').selectOption('horario');
    await page.getByLabel('Destinatario').selectOption({ label: 'Sénior Jueves' });
    await page.getByLabel('Vigencia desde la publicación').selectOption('3d');
    await page.evaluate(() => {
      document.activeElement.blur();
      window.scrollBy(0, document.querySelector('.aviso-editor').getBoundingClientRect().top - 20);
    });
    await captura('04-editor');
    await previa();
    const vista = page.getByRole('region', { name: 'Vista previa' });
    await vista.getByText(contenido).waitFor();
    assert.equal(await tarjeta(nuevo).count(), 1);
    await captura('05-vista-previa');
    await page.getByRole('button', { name: 'Publicar aviso' }).click();
    await page.getByText('Aviso publicado.').waitFor();
    await tarjeta(nuevo).waitFor();
    await page.evaluate(() => window.scrollBy(0, 130));
    await captura('06-historial');

    await nav('/');
    await aviso(nuevos, nuevo).click();
    await detalle.getByText(contenido).waitFor();
    await cerrar();
    await aviso(leidos, nuevo).waitFor();
    await nav('/noticias');
    await tabAvisos();
    await gestionar();
    await tarjeta(nuevo).getByRole('button', { name: 'Editar' }).click();
    const renotificar = page.getByRole('checkbox', { name: 'Volver a notificar a los destinatarios' });
    assert.equal(await renotificar.isChecked(), false);
    await page.getByLabel('Título', { exact: true }).fill('Horario corregido');
    await page.getByRole('checkbox', { name: 'Cambiar vencimiento' }).check();
    await page.locator('#aviso-vence').fill('2099-11-28T10:45');
    await previa();
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await page.getByText('Cambios guardados.').waitFor();
    await nav('/');
    await aviso(leidos, 'Horario corregido').waitFor();
    assert.equal(await nuevos.count(), 0);

    await nav('/noticias');
    await tabAvisos();
    await gestionar();
    await tarjeta('Horario corregido').getByRole('button', { name: 'Editar' }).click();
    await renotificar.check();
    await previa();
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await page.getByText('Cambios guardados.').waitFor();
    await nav('/');
    await aviso(nuevos, 'Horario corregido').waitFor();
    assert.equal(await aviso(leidos, 'Horario corregido').count(), 0);

    await nav('/noticias');
    await tabAvisos();
    await gestionar();
    const corregido = tarjeta('Horario corregido');
    await corregido.getByRole('button', { name: 'Retirar' }).click();
    await corregido.getByRole('button', { name: 'Confirmar retiro' }).click();
    await page.getByLabel('Filtrar por estado').selectOption('retirado');
    await corregido.getByText('Retirado', { exact: true }).waitFor();
    assert.equal(await page.getByRole('article').count(), 1);
    await page.getByRole('link', { name: 'Avisos de Noticias' }).click();
    await aviso(noticias, ejemplo).waitFor();
    assert.equal(await aviso(noticias, 'Horario corregido').count(), 0);
    await nav('/');
    assert.equal(await nuevos.count(), 0);

    await page.clock.fastForward(73 * 3600000);
    await aviso(leidos, ejemplo).waitFor({ state: 'detached' });
    await aviso(leidos, 'Revisa la programación').waitFor();

    await nav('/noticias');
    await page.getByRole('tab', { name: 'El Jara Informa' }).click();
    await page.getByText('Última edición', { exact: false }).first().waitFor();
    await page.getByRole('tab', { name: 'Cortita y al pie' }).click();
    await page.getByText('Cortita y al pie: Jugador de ejemplo').click();
    await page.getByRole('heading', { name: 'Cortita y al pie: Jugador de ejemplo' }).waitFor();
    await sinDesborde();
    assert.deepEqual(errores, []);
    console.log(`OK · ${perfil}, Chromium a 375 px · deslizamiento táctil, lectura, Noticias, edición, retiro, vencimiento y regresiones B1/B2`);
  } finally {
    await context.close();
  }
}

// Dos contextos aislados comparten solo la respuesta de las RPC simuladas.
// La autorización y el almacenamiento reales se comprueban en test:avisos-db.
async function probarSincronizacion() {
  const leidos = new Set();
  const aviso = {
    id: 'aviso-compartido', titulo: 'Aviso entre dispositivos', mensaje: 'Mensaje ficticio',
    tipo: 'informativo', estado: 'vigente', publicado_en: new Date().toISOString(), version: 1,
  };
  async function abrirContexto(actor) {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    await context.exposeBinding('rpcAvisosDePrueba', (_, funcion, parametros) => {
      if (funcion === 'avisos_vigentes') return [{ ...aviso, leido: leidos.has(actor) }];
      if (funcion === 'aviso_abrir' && parametros.p_id === aviso.id) {
        leidos.add(actor);
        return { ...aviso, leido: true };
      }
      throw new Error(`RPC inesperada: ${funcion}`);
    });
    await context.route('**/src/lib/avisos.js', async (ruta) => {
      const respuesta = await ruta.fetch();
      const codigo = await respuesta.text();
      await ruta.fulfill({
        response: respuesta,
        body: codigo.replace(/"[^"]*\/supabase\.js"/, '"/rpc-avisos-de-prueba.js"'),
      });
    });
    await context.route('**/rpc-avisos-de-prueba.js', (ruta) => ruta.fulfill({
      contentType: 'text/javascript',
      body: 'export const esDemo = false; export const llamar = window.rpcAvisosDePrueba;',
    }));
    const page = await context.newPage();
    await page.goto(url);
    return page;
  }

  const a = await abrirContexto('socio-a');
  await a.getByRole('region', { name: 'Avisos nuevos' }).getByRole('button', { name: /Aviso entre dispositivos/ }).click();
  await a.getByRole('dialog').getByRole('heading', { name: aviso.titulo }).waitFor();
  await a.context().close();
  const b = await abrirContexto('socio-a');
  await b.getByRole('region', { name: 'Avisos vigentes' }).getByText(aviso.titulo).waitFor();
  assert.equal(await b.getByRole('region', { name: 'Avisos nuevos' }).count(), 0);
  await b.context().close();
  const c = await abrirContexto('socio-b');
  await c.getByRole('region', { name: 'Avisos nuevos' }).getByText(aviso.titulo).waitFor();
  await c.context().close();
  console.log('OK · Lectura de la misma cuenta entre contextos aislados y lectura independiente de otro socio (RPC simuladas)');
}

try {
  for (const perfil of ['iPhone 13', 'Pixel 7']) await probar(perfil);
  await probarSincronizacion();
} finally {
  await browser.close();
}
