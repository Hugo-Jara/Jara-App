// Ajustes de este teléfono: tema (claro u oscuro) y tamaño de letra.
// Se guardan en el navegador, no en la base: cada teléfono tiene los suyos.

const LLAVE = 'jara-ajustes';
const PREDETERMINADOS = { tema: 'oscuro', letra: 'normal' };

export const TEMAS = [
  { valor: 'oscuro', nombre: 'Oscuro' },
  { valor: 'claro', nombre: 'Claro' },
  { valor: 'sistema', nombre: 'Como el teléfono' },
];

export const LETRAS = [
  { valor: 'normal', nombre: 'Normal' },
  { valor: 'grande', nombre: 'Grande' },
  { valor: 'muy-grande', nombre: 'Muy grande' },
];

export const leerAjustes = () => {
  try {
    return { ...PREDETERMINADOS, ...JSON.parse(localStorage.getItem(LLAVE) || '{}') };
  } catch {
    return { ...PREDETERMINADOS };
  }
};

const oscuroDelSistema = () => {
  try { return window.matchMedia('(prefers-color-scheme: dark)').matches; } catch { return true; }
};

// Pone el tema y la letra en <html>; los estilos hacen el resto.
export const aplicarAjustes = (ajustes = leerAjustes()) => {
  const tema = ajustes.tema === 'sistema' ? (oscuroDelSistema() ? 'oscuro' : 'claro') : ajustes.tema;
  const raiz = document.documentElement;
  raiz.dataset.tema = tema;
  raiz.dataset.letra = ajustes.letra;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', tema === 'claro' ? '#f6f1eb' : '#120e0d');
};

export const guardarAjuste = (nombre, valor) => {
  const ajustes = { ...leerAjustes(), [nombre]: valor };
  try { localStorage.setItem(LLAVE, JSON.stringify(ajustes)); } catch { /* sin almacenamiento: dura hasta cerrar */ }
  aplicarAjustes(ajustes);
  return ajustes;
};

// Si eligió "Como el teléfono", sigue al teléfono cuando este cambia de modo.
export const seguirAlSistema = () => {
  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (leerAjustes().tema === 'sistema') aplicarAjustes();
    });
  } catch { /* navegador antiguo: se aplica al abrir */ }
};
