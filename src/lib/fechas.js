// Las fechas viajan como "2026-10-10". Se arman a mediodía para que ningún
// huso horario las corra de día.
const aFecha = (iso) => new Date(`${iso}T12:00:00`);
const mayuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);

// "Sábado 10 de octubre"
export const fechaLarga = (iso) =>
  mayuscula(aFecha(iso).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }));

// "10 de octubre"
export const fechaCorta = (iso) =>
  aFecha(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'long' });

// "lunes"
export const diaSemana = (iso) => aFecha(iso).toLocaleDateString('es-CL', { weekday: 'long' });

export const hoyIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// El próximo día de la semana pedido (0 = domingo … 6 = sábado), sin contar hoy.
export const proximoDia = (diaDeLaSemana) => {
  const d = new Date();
  d.setDate(d.getDate() + (((diaDeLaSemana - d.getDay() + 7) % 7) || 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// La fecha `iso` corrida `n` días (negativo = hacia atrás).
export const correrDias = (iso, n) => {
  const d = aFecha(iso);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
