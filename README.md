# El Rosco — versión servidor (Docker)

Juego El Rosco estilo Pasapalabra para dos jugadores, con vistas sincronizadas en tiempo real:
moderador, dos jugadores y vista pública.

## Quickstart

```bash
docker compose up --build -d
```

Abrí en el navegador:

- **Administración / moderación:** http://localhost:3000/admin
- Los QR que genera el servidor apuntan a la **IP de red local** del equipo
  (ej. `http://192.168.1.50:3000`), para que cada jugador abra su vista en su
  propio dispositivo escaneando el QR.

Al crear una partida desde **Partida** se muestran los QR y links de:
jugador 1, jugador 2 y vista pública.

## Cómo funciona cada vista

| Vista | URL | Qué muestra |
|---|---|---|
| Admin | `/admin` | Configuración, temáticas, palabras y **moderación**: inicia la partida, ve la respuesta sin ocultar y juzga Correcto / Error / Pasapalabra. |
| Jugador 1 | `/juego/:codigo/jugador1` | Su rosco, su tiempo y su pregunta (sin la respuesta). Si no es su turno, lo indica. |
| Jugador 2 | `/juego/:codigo/jugador2` | Igual que jugador 1. |
| Pública | `/juego/:codigo/publico` | El jugador activo en grande (rosco, tiempo, pregunta) y al costado el rosco del otro jugador con su próxima letra y tiempo restante. |

El servidor es la fuente de verdad: el estado de la partida y el
**temporizador corren en el servidor** (se evita el drift de la versión
estática cuando la pestaña pierde el foco). Las vistas se sincronizan por
WebSocket en salas identificadas por el código de partida.

## Reglas implementadas

- Rosco de 25 letras (sin K ni W, con Ñ).
- Pistas "contiene" solo para J, Ñ, Q, Y, Z; "empieza con" para el resto.
- Por turnos: errar o pasar cede el turno; la reanudación la confirma el
  moderador o el jugador en turno.
- Si un jugador termina o se queda sin tiempo, el otro sigue solo.
- Colores: verde acierto, rojo error, amarillo pasapalabra, azul actual.
- Desempate: más aciertos → menos errores → más tiempo restante.
- Las definiciones no se repiten para el mismo jugador ni entre jugadores
  en la misma partida; se priorizan las de menor contador de usos.
- Las letras con menos de 2 definiciones activas no entran en juego.

## Temáticas y palabras (pestañas del admin)

- **Temáticas:** crear, renombrar y eliminar. Cada una tiene su base de
  definiciones separada. La temática **Familiar** viene precargada con el
  banco original (293 definiciones).
- **Palabras:** editor por letra (palabra, definición, tipo de pista,
  alternativas, activa, contador de usos editable). Habilitar/deshabilitar
  letras sin borrar sus definiciones. Los cambios quedan en borrador hasta
  **Guardar todo el listado**; **Restablecer** los descarta.

## Desarrollo local (sin Docker)

```bash
npm install
npm run build
npm start
# o: npx tsc --watch  +  node dist/index.js
```

Variables de entorno:

| Variable | Default | Descripción |
|---|---|---|
| `PORT` | `3000` | Puerto HTTP/WebSocket |
| `DATA_DIR` | `./data` | Carpeta del SQLite (`rosco.db`) |

## API REST (resumen)

- `GET /api/health`, `GET /api/info`
- Temáticas: `GET/POST /api/themes`, `PUT/DELETE /api/themes/:id`
- Definiciones: `GET /api/themes/:id/definitions`, `PUT /api/themes/:id/bank`
- Letras: `GET /api/themes/:id/letters`, `PUT /api/themes/:id/letters/:letter`
- Partidas: `GET/POST /api/games`, `GET /api/games/:code`,
  `POST /api/games/:code/start|judge|resume`

El juego en vivo también expone las mismas acciones por WebSocket
(`join`, `judge`, `resume`, `start`) en `/ws`.

## Notas y limitaciones

- Pensado para red local (juego familiar / aula). No hay autenticación:
  el código de partida es lo único que identifica la sala.
- El estado vivo de las partidas está en memoria: si el servidor se
  reinicia, las partidas en curso se pierden (el registro queda en la base).
- La base SQLite vive en el volumen `rosco-data`; las temáticas y ediciones
  persisten entre reinicios.
