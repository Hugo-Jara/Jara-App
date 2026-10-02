// La app puede vivir en la raíz de un dominio o en una subcarpeta (por ejemplo
// usuario.github.io/jara-app/). Todo lo que apunte a archivos públicos o a
// rutas internas parte de esta base.
export const BASE = import.meta.env.BASE_URL;
export const ESCUDO = `${BASE}escudo.jpg`;
