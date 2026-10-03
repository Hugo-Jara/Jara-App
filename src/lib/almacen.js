import { useSyncExternalStore } from 'react';

// Un almacén chico para datos que varias pantallas comparten (los partidos, el
// entrenamiento): se cargan una vez, se recargan al volver a la app (por
// ejemplo desde WhatsApp) y después de cada cambio.
export function crearAlmacen(cargar) {
  let estado = { cargando: true, error: '', datos: null };
  let enCurso = null;
  const oyentes = new Set();
  const emitir = (cambio) => { estado = { ...estado, ...cambio }; oyentes.forEach((f) => f()); };

  const recargar = () => {
    enCurso ??= cargar()
      .then((datos) => emitir({ cargando: false, error: '', datos }),
            (e) => emitir({ cargando: false, error: e.message }))
      .finally(() => { enCurso = null; });
    return enCurso;
  };
  const alVolver = () => document.visibilityState === 'visible' && recargar();

  const suscribir = (f) => {
    oyentes.add(f);
    if (oyentes.size === 1) {
      recargar();
      document.addEventListener('visibilitychange', alVolver);
    }
    return () => {
      oyentes.delete(f);
      if (oyentes.size === 0) document.removeEventListener('visibilitychange', alVolver);
    };
  };

  return {
    recargar,
    // Al cambiar de cuenta no puede quedar a la vista lo de la anterior.
    vaciar: () => emitir({ cargando: true, error: '', datos: null }),
    usar: () => useSyncExternalStore(suscribir, () => estado),
  };
}
