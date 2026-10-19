# Jara App

La app del Club Deportivo Hugo Jara: partidos, asambleas, cuotas, compras y ministerios en un solo lugar. Web instalable (PWA) hecha con React + Vite y Supabase.

## Cómo correrla

```bash
npm install
cp .env.example .env.local   # completar con los datos del proyecto Supabase del club
npm run dev
```

Sin `.env.local` la app abre en **modo demostración**: se puede recorrer, pero no lee ni guarda nada. En ese modo, `/ingreso` muestra la pantalla de entrada.

## Base de datos

Las migraciones están en `supabase/migrations/` y se aplican en orden:

| Archivo | Qué crea |
| --- | --- |
| `0001_base.sql` | Club, nómina de personas, equipos, áreas (ministerios), roles y permisos |
| `0002_cotizaciones.sql` | Solicitudes de compra, adjuntos, historial y reglas del flujo |
| `0003_storage_compras.sql` | Bucket privado para cotizaciones y boletas |
| `0004_funciones_de_trigger_privadas.sql` | Quita el acceso por la API a las funciones de trigger |
| `0005_pedidos_de_compra.sql` | Pedidos de compra por link, sin cuenta: tablas y funciones |
| `0006_storage_pedidos.sql` | Bucket de archivos de los pedidos |
| `0007_comprobante_de_transferencia.sql` | Hacienda adjunta el comprobante al entregar la plata; el archivo solo se abre con el link de Hacienda |
| `0008_hacienda_edita_y_elimina.sql` | Hacienda edita nombre, glosa y monto, y elimina compras (quedan guardadas como `eliminado`) |
| `0009_ingreso_por_nombre.sql` | Cada jugador elige su nombre de la nómina y un encargado de su plantel lo aprueba |
| `0010_partidos.sql` | Partidos por plantel y asistencia (voy, duda, baja) |
| `0011_entrenamientos.sql` | Listas de entrenamiento con cupos, pago por sesión y deudas |
| `0012_resultado_y_estadisticas.sql` | Marcador, goles, asistencias y tarjetas por jugador, tablas de estadística y permiso para anotar |
| `0013_administra_entrenamientos.sql` | Permiso personal para administrar los entrenamientos (abrir y eliminar listas, bajar gente y cobrar) sin ser encargado ni tesorero |
| `0014_hora_de_inicio.sql` | Hora de inicio del partido, además de la hora de citación |
| `0015_pagos_de_entrenamiento.sql` | Los pagos de entrenamiento no se pierden: se marcan desde el día del entrenamiento, bajarse o reinscribirse no borra un pago, bitácora `entrenamiento_pagos`, y no se eliminan listas pasadas o con pagos |
| `0016_multa_desde_las_cinco.sql` | La multa por bajarse corre desde las 5:00 del día del entrenamiento, y desde la hora de inicio uno ya no se baja |

`npm run test:db` y `npm run test:pedidos` aplican las migraciones en un Postgres en memoria y prueban los permisos, el flujo de cotizaciones, el ingreso por nombre, los partidos, los entrenamientos y los pedidos por link.

## Pedidos de compra

Un pedido se abre en `/pedido/<código>`. Cada pedido tiene dos códigos: uno para quienes piden y otro para Hacienda. Para crear uno:

```sql
insert into public.pedidos (club_id, nombre)
select id, 'Nombre del evento' from public.clubes where slug = 'hugo-jara'
returning token, token_hacienda;
```

## Estructura

- `src/lib/sesion.jsx`: ingreso (Google o link al correo) y enlace de la cuenta con la nómina.
- `src/components/Marco.jsx`: encabezado y navegación inferior.
- `src/pages/`: una pantalla por módulo.
