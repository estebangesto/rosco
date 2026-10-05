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
- Si un jugador termina o se queda sin tiempo, el otro sigue solo; en ese
  caso errar o pasar lo deja en espera (pausa), listo para continuar, y el
  reloj no sigue corriendo.
- Colores: verde acierto, rojo error, amarillo pasapalabra, azul actual.
- Desempate: más aciertos → menos errores → más tiempo restante.
- Al terminar, las cuatro vistas muestran la pantalla final: ganador con
  festejo, estadísticas, ambos roscos y el detalle de definiciones de cada
  jugador indicando si fue bien contestada o no.
- Atajos del moderador: `1` correcto, `2` incorrecto, `3` pasapalabra,
  `4` pausa o reanuda el turno según el estado.
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
| `PUBLIC_BASE_URL` | *(auto)* | Base pública para links y QR, ej. `http://192.168.1.50:3000`. Solo necesaria como override manual: por defecto se usa el **Host del request** (si abrís el admin con la IP de la LAN, los QR salen con esa IP) y como respaldo la mejor IP LAN autodetectada (se ignoran interfaces virtuales/docker/vpn y link-local). |

En `docker-compose.yml` podés fijarla así:

```yaml
environment:
  - PUBLIC_BASE_URL=http://192.168.1.50:3000
```

## API REST (resumen)

- `GET /api/health`, `GET /api/info`
- Temáticas: `GET/POST /api/themes`, `PUT/DELETE /api/themes/:id`
- Definiciones: `GET /api/themes/:id/definitions`, `PUT /api/themes/:id/bank`
- Letras: `GET /api/themes/:id/letters`, `PUT /api/themes/:id/letters/:letter`
- Partidas: `GET/POST /api/games`, `GET /api/games/:code`,
  `POST /api/games/:code/start|judge|resume`
- Dirección del servidor por partida: `PUT /api/games/:code/base-url`
  con `{ "baseUrl": "http://192.168.1.20:3000" }`; regenera links y QR
  con la nueva dirección. También se puede fijar al crear la partida
  (`POST /api/games` acepta `baseUrl`) o desde la pantalla Partida del
  admin (campo + botón Aplicar). La dirección guardada tiene prioridad
  sobre `PUBLIC_BASE_URL` y el Host del request.

El juego en vivo también expone las mismas acciones por WebSocket
(`join`, `judge`, `resume`, `start`) en `/ws`.

## Notas y limitaciones

- Pensado para red local (juego familiar / aula). No hay autenticación:
  el código de partida es lo único que identifica la sala.
- El estado vivo de las partidas está en memoria: si el servidor se
  reinicia, las partidas en curso se pierden (el registro queda en la base).
- La base SQLite vive en el volumen `rosco-data`; las temáticas y ediciones
  persisten entre reinicios.
