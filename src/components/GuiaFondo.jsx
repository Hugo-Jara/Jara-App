import { pesos } from '../lib/pedido.js';
import { desglose, nombreMes, HONORARIO_BRUTO } from '../lib/fondo.js';
import { plural } from '../lib/texto.js';

// Fondo Las Condes · paso a paso (Compras 3). Arriba, lo que falta ahora con
// los datos del fondo; abajo, cómo se hace cada cosa, en el orden de siempre.
// Los artículos citados son del reglamento (Decreto Alcaldicio N°749, 2024).

const mesDeHoy = () => new Date().getMonth() + 1;

// Lo que toca hacer ahora, a partir de lo que hay en el fondo.
export function pendientesDelFondo(f, hoyMes = mesDeHoy()) {
  const lista = [];
  if (f.porClasificar.length) {
    lista.push({ vista: 'compras', texto: `${plural(f.porClasificar.length, 'compra pedida', 'compras pedidas')} en Compras por pasar al fondo`, detalle: 'Elige su ítem del presupuesto.' });
  }
  const sinRespaldos = f.compras.filter((c) => c.item !== 'personal' && c.estado === 'pendiente').length;
  if (sinRespaldos) {
    lista.push({ vista: 'compras', texto: `${plural(sinRespaldos, 'gasto', 'gastos')} con datos o respaldos por completar`, detalle: 'Ábrelos y marca lo que falta.' });
  }
  for (const c of f.compras.filter((x) => x.item === 'personal')) {
    const mes = nombreMes(c.mes);
    if (!c.pago && !c.pedido && c.mes <= hoyMes) {
      lista.push({ vista: 'honorarios', texto: `Pedir el pago de los honorarios de ${mes}`, detalle: 'Sube la boleta del entrenador y aprieta «Pedir el pago a Hacienda».' });
    } else if (!c.pago && c.pedido) {
      lista.push({ vista: 'honorarios', texto: `Hacienda tiene que transferir los honorarios de ${mes}`, detalle: `${pesos(desglose(c.monto).liquido)} líquidos, y subir el comprobante.` });
    } else if (c.pago && !c.respaldos.f29 && c.mes < hoyMes) {
      lista.push({ vista: 'honorarios', texto: `Marcar el F29 de ${nombreMes(c.mes + 1)} con la retención de ${mes}`, detalle: `${pesos(desglose(c.monto).retencion)} de retención.` });
    }
  }
  if (f.paraRendir.length) {
    const abierta = f.rendiciones.find((r) => !r.presentada);
    if (abierta) lista.push({ vista: 'rendiciones', texto: `${plural(f.paraRendir.length, 'gasto listo', 'gastos listos')} para la ${abierta.nombre}`, detalle: 'Revisa la hoja antes de presentarla.' });
  }
  return lista;
}

function Paso({ titulo, children }) {
  return <li><span><strong>{titulo}</strong>{children && <small>{children}</small>}</span></li>;
}

export default function GuiaFondo({ f, ir }) {
  const pendientes = pendientesDelFondo(f);
  const h = desglose(HONORARIO_BRUTO);
  return (
    <>
      <h2 className="seccion" style={{ marginTop: 0 }}>Lo que falta ahora</h2>
      <section className="card">
        {pendientes.length === 0 ? (
          <p className="respuesta sin-margen">Todo al día. Cuando alguien pida una compra del fondo o llegue la boleta del entrenador, aparece acá.</p>
        ) : (
          <ul className="movimientos guia-pendientes">
            {pendientes.map((p) => (
              <li key={p.texto}>
                <button type="button" className="guia-pendiente" onClick={() => ir(p.vista)}>
                  <span><strong>{p.texto}</strong><small>{p.detalle}</small></span>
                  <span className="enlace">Ir</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <h2 className="seccion">Una compra del fondo</h2>
      <section className="card">
        <ol className="pasos">
          <Paso titulo="Pedir la compra">Quien compra entra a Más &gt; Compras, tópico «Fondo Las Condes», escribe qué y cuánto (con IVA) y sube la cotización.</Paso>
          <Paso titulo="Aprobar y pagar">Hacienda la aprueba en Compras y paga con la cuenta o el débito del club. Sube el comprobante de la transferencia.</Paso>
          <Paso titulo="Subir la boleta">Quien compró sube la boleta o factura a nombre del club, en su compra. Eso es todo lo que hace el socio.</Paso>
          <Paso titulo="Pasarla al fondo">Acá, en la pestaña Compras, «Por pasar al fondo»: elige el ítem del presupuesto. La cotización, la boleta y el comprobante ya vienen marcados.</Paso>
          <Paso titulo="Completar datos y respaldos">Ábrela, aprieta «Completar datos» (proveedor, N° de boleta, fecha y forma de pago) y marca la certificación y el original firmado. Si se entrega a los participantes, también la nómina firmada (solo en papel).</Paso>
          <Paso titulo="Queda «Lista para rendir»">Cuando tiene todo y la pagó el club, entra sola a la próxima rendición.</Paso>
        </ol>
      </section>

      <h2 className="seccion">Los honorarios del entrenador, cada mes</h2>
      <section className="card">
        <dl className="total-detalle" style={{ marginTop: 0, marginBottom: 12 }}>
          <div><dt>Boleta (bruto)</dt><dd>{pesos(h.bruto)}</dd></div>
          <div><dt>Retención 15,25 %</dt><dd>{pesos(h.retencion)}</dd></div>
          <div><dt>Se transfiere</dt><dd>{pesos(h.liquido)}</dd></div>
        </dl>
        <ol className="pasos">
          <Paso titulo="El entrenador emite su boleta de honorarios">Electrónica, a nombre del club, por {pesos(h.bruto)} brutos y con retención (art. 18).</Paso>
          <Paso titulo="El equipo del fondo pide el pago">En la pestaña Honorarios: sube la boleta, anota su N° y su fecha y aprieta «Pedir el pago a Hacienda». Si quieres, avísale por WhatsApp.</Paso>
          <Paso titulo="Hacienda transfiere el líquido">Le llega en Inicio. Transfiere {pesos(h.liquido)} desde la cuenta del club y sube el comprobante con «Ya transferí» (art. 19).</Paso>
          <Paso titulo="El club paga la retención en el F29">Los {pesos(h.retencion)} se declaran y pagan en el F29 del mes siguiente, hasta el día 20. Después se marca «Formulario 29» en la cuota (art. 20).</Paso>
          <Paso titulo="Certificación y original">Se marca la certificación de la contratación y el original archivado, firmado y timbrado. Con eso la cuota queda lista para rendir.</Paso>
        </ol>
        <p className="item-meta">Lo que se rinde es el bruto, {pesos(h.bruto)}: la boleta más el F29 suman eso. Los honorarios no van por Compras.</p>
      </section>

      <h2 className="seccion">Rendir a la Municipalidad</h2>
      <section className="card">
        <ol className="pasos">
          <Paso titulo="Abrir la hoja">En Rendiciones, «Ver hoja para firmar»: trae todos los gastos listos, con los mismos datos del Anexo N°1.</Paso>
          <Paso titulo="Imprimir, firmar y timbrar">La firman el tesorero y el representante legal, con el timbre del club.</Paso>
          <Paso titulo="Subirla">En subvenciones.lascondes.cl, con los respaldos (art. 17). Cada dos meses; la última antes del 30 de diciembre.</Paso>
          <Paso titulo="Marcarla presentada y subida">«Marcar como presentada» congela esos gastos y no se deshace desde la app: hazlo solo cuando ya la entregaste.</Paso>
          <Paso titulo="Si la Municipalidad observa algo">Hay 10 días hábiles para corregirlo (arts. 24–25).</Paso>
        </ol>
      </section>

      <h2 className="seccion">Reglas que no se olvidan</h2>
      <section className="card">
        <ul className="guia-reglas">
          <li>Solo se rinde lo pagado con la cuenta o el débito del club. Lo que pagó un particular no se rinde (art. 9).</li>
          <li>Solo boletas desde el 1 de octubre (art. 5).</li>
          <li>Solo lo que está en el presupuesto aprobado. Lo que se pasa de un ítem lo pone el club (art. 6).</li>
          <li>Lo que sobra de un ítem se devuelve a la Municipalidad; no se pasa a otro ítem (art. 6).</li>
          <li>No se rinden multas, intereses ni impuestos (art. 11).</li>
          <li>La nómina de entrega lleva cédula y domicilio: queda solo en papel, nunca en la app.</li>
        </ul>
      </section>
    </>
  );
}
