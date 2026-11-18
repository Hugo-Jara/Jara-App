# Puente de la dirección vieja

Desde el cambio a **hugojara.cl**, GitHub Pages (`hugo-jara.github.io/Jara-App`)
ya no publica la app sino esta carpeta:

- `index.html` y `404.html` (iguales): mandan a la misma pantalla en hugojara.cl
  y pasan la sesión y los ajustes, para que nadie tenga que volver a entrar.
  Si la app estaba instalada en el teléfono, muestran cómo instalar la nueva.
- `sw.js`: reemplaza al service worker de la app vieja, borra lo guardado y
  recarga, para que los teléfonos con la app instalada no se queden pegados en
  una versión antigua.

La app la recibe en `src/lib/traspaso.js`.
