// Build de producción para hugojara.cl (Cloudflare Pages: comando `npm run publicar`,
// carpeta `dist`). Corre las pruebas y, si pasan, arma la app. Si una prueba
// falla, el build se corta y queda publicada la versión anterior.
// No hace falta cargar variables en Cloudflare: los datos públicos van aquí.
import { execSync } from 'node:child_process';

const env = {
  ...process.env,
  // Con dominio propio la app queda en la raíz (/).
  VITE_BASE: process.env.VITE_BASE || '/',
  // Datos públicos del proyecto Supabase del club. La clave "publishable"
  // está hecha para ir en el navegador; los datos los protege la base.
  VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || 'https://pzzkrbnzguqtjrlwgtiy.supabase.co',
  VITE_SUPABASE_KEY: process.env.VITE_SUPABASE_KEY || 'sb_publishable_Wy5oEjC-SXRUJdNkREM7Qw_b9xRl9zu',
};

for (const paso of ['test:db', 'test:pedidos', 'test:fotos-drive', 'build']) {
  console.log(`\n=== npm run ${paso} ===`);
  execSync(`npm run ${paso}`, { stdio: 'inherit', env });
}
