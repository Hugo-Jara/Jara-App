import { esDemo, llamar } from './supabase.js';

export const TIPOS_AVISO = {
  informativo: { nombre: 'Informativo', icono: 'noticias' },
  suspension: { nombre: 'Suspensión', icono: 'aviso-suspension' },
  horario: { nombre: 'Cambio de horario', icono: 'entrenar' },
  recordatorio: { nombre: 'Recordatorio', icono: 'campana' },
  importante: { nombre: 'Importante', icono: 'aviso-importante' },
};

export const VIGENCIAS_AVISO = {
  '24h': { nombre: '24 horas', horas: 24 },
  '3d': { nombre: '3 días', horas: 72 },
  '7d': { nombre: '7 días', horas: 168 },
  manual: { nombre: 'Hasta retirarlo manualmente', horas: null },
};

export const ESTADOS_AVISO = { vigente: 'Vigente', vencido: 'Vencido', retirado: 'Retirado' };

export const vigente = (aviso) => !aviso.retirado_en && (!aviso.vence_en || Date.parse(aviso.vence_en) > Date.now());
export const destinatario = (equipo) => equipo ? equipo.replace(/^Senior\b/i, 'Sénior') : 'Todos los socios';

const formatoFecha = new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short' });
export const fechaAviso = (fecha) => formatoFecha.format(new Date(fecha));
const iso = (ms = Date.now()) => new Date(ms).toISOString();
export function vencimientoAviso(vigencia, desde) {
  const { horas } = VIGENCIAS_AVISO[vigencia];
  return horas === null ? null : iso(desde + horas * 3600000);
}

const plantelesDemo = [
  { id: 'e-sabado', nombre: 'Senior Sábado' },
  { id: 'e-jueves', nombre: 'Senior Jueves' },
  { id: 'e-junior', nombre: 'Junior Sábado' },
];
// Para probar un aviso general y uno segmentado, el socio ficticio de B3
// pertenece a ambos Sénior. Toda la demostración se reinicia al recargar.
const plantelesSocioDemo = new Set(['e-sabado', 'e-jueves']);
const publicado = Date.now();
const baseDemo = { autor: 'Comunicaciones (demo)', version: 1, leido: false };

let avisosDemo = [
  {
    ...baseDemo, id: 'suspension-demo', titulo: 'Partido suspendido',
    mensaje: 'Se informa que el partido de este jueves 26 de noviembre ha sido suspendido.',
    tipo: 'suspension', equipo_id: 'e-jueves', equipo: 'Senior Jueves',
    publicado_en: iso(publicado), vence_en: vencimientoAviso('3d', publicado),
  },
  {
    ...baseDemo, id: 'recordatorio-demo', titulo: 'Revisa la programación',
    mensaje: 'Consulta en Partidos los horarios de los próximos encuentros del club.',
    tipo: 'recordatorio', publicado_en: iso(publicado - 60000), vence_en: null,
  },
];

const completosDemo = () => avisosDemo.map((aviso) => ({
  ...aviso, estado: aviso.retirado_en ? 'retirado' : vigente(aviso) ? 'vigente' : 'vencido',
}));

export async function cargarAvisos() {
  return esDemo
    ? completosDemo().filter((a) => vigente(a) && (!a.equipo_id || plantelesSocioDemo.has(a.equipo_id)))
    : llamar('avisos_vigentes');
}

export async function abrirAviso(id) {
  if (!esDemo) return llamar('aviso_abrir', { p_id: id });
  const aviso = (await cargarAvisos()).find((a) => a.id === id);
  if (!aviso) return null;
  avisosDemo = avisosDemo.map((a) => a.id === id ? { ...a, leido: true } : a);
  return { ...aviso, leido: true };
}

export async function cargarHistorial(estado) {
  return esDemo
    ? { planteles: plantelesDemo, avisos: completosDemo().filter((a) => !estado || a.estado === estado) }
    : llamar('avisos_historial', { p_estado: estado || null });
}

export async function guardarAviso(datos, anterior) {
  const campos = { titulo: datos.titulo.trim(), mensaje: datos.mensaje.trim(), tipo: datos.tipo, equipo_id: datos.equipo_id || null };
  if (!campos.titulo || !campos.mensaje) throw new Error('Escribe el título y el mensaje del aviso.');
  if (!esDemo) {
    const parametros = { p_titulo: campos.titulo, p_mensaje: campos.mensaje, p_tipo: campos.tipo, p_equipo_id: campos.equipo_id };
    return anterior
      ? llamar('aviso_editar', {
        ...parametros, p_id: anterior.id, p_cambiar_vencimiento: datos.cambiarVencimiento,
        p_vence_en: datos.vence_en, p_renotificar: datos.renotificar, p_modificado_en: anterior.modificado_en,
      })
      : llamar('aviso_publicar', { ...parametros, p_vigencia: datos.vigencia });
  }

  if (datos.vence_en && Date.parse(datos.vence_en) <= Date.now()) throw new Error('El vencimiento debe ser una fecha futura.');
  const equipo = plantelesDemo.find((e) => e.id === campos.equipo_id)?.nombre;
  if (anterior) {
    avisosDemo = avisosDemo.map((a) => a.id === anterior.id ? {
      ...a, ...campos, equipo, modificado_en: iso(),
      vence_en: datos.cambiarVencimiento ? datos.vence_en : a.vence_en,
      version: a.version + Number(datos.renotificar), leido: !datos.renotificar && a.leido,
    } : a);
    return anterior.id;
  }
  const id = crypto.randomUUID();
  const ahora = Date.now();
  avisosDemo = [{
    ...baseDemo, ...campos, id, equipo, publicado_en: iso(ahora), vence_en: vencimientoAviso(datos.vigencia, ahora),
  }, ...avisosDemo];
  return id;
}

export async function retirarAviso(id) {
  if (!esDemo) return llamar('aviso_retirar', { p_id: id });
  avisosDemo = avisosDemo.map((a) => a.id === id && !a.retirado_en
    ? { ...a, retirado_en: iso(), modificado_en: iso() } : a);
}
