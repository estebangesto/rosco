# El Rosco — versión servidor (Docker)

El Rosco estilo Pasapalabra para dos jugadores, con las cuatro vistas
sincronizadas en tiempo real: moderación, jugador 1, jugador 2 y vista para
el público. Se distribuye como imagen Docker lista para usar.

## Puesta en marcha

```bash
docker compose up --build -d
```

Abrí `http://localhost:3000/admin` en el navegador. En la pestaña
**Partida** creás la sesión: cargás los nombres, el tiempo por jugador y la
temática, y obtenés los links y códigos QR para que cada jugador abra su
vista en su propio dispositivo.

## Vistas

| Vista | URL | Contenido |
|---|---|---|
| Administración | `/admin` | Pestañas Partida, Moderación, Temáticas y Palabras. |
| Jugador 1 | `/juego/:codigo/jugador1` | Su rosco, su tiempo y su pregunta (sin la respuesta). Si no es su turno, lo indica. |
| Jugador 2 | `/juego/:codigo/jugador2` | Igual que jugador 1. |
| Pública | `/juego/:codigo/publico` | El jugador activo en grande (rosco, tiempo, pregunta) y al costado el rosco del otro jugador con su próxima letra y tiempo restante. |

El servidor concentra el estado de la partida y el temporizador; las vistas
se sincronizan por WebSocket en salas identificadas por el código de la
partida.

## Dirección del servidor (links y QR)

Los links y QR tienen que apuntar a una dirección alcanzable desde los
demás dispositivos de la red. Se resuelve en este orden:

1. La dirección guardada en la partida (tiene prioridad).
2. La variable `PUBLIC_BASE_URL`, como ajuste manual.
3. El Host con el que se abrió el admin (si abrís el admin con la IP de la
   LAN, los QR salen con esa IP).
4. La mejor IP LAN autodetectada.

En la pantalla **Partida** hay un campo opcional para cargarla antes de
crear la partida, y en **Accesos** un campo con botón **Aplicar** para
cambiarla después y regenerar los links y QR.

## Moderación

Desde la pestaña **Moderación** el moderador inicia la partida, ve la
respuesta de cada letra sin ocultar y juzga con los botones Correcto,
Incorrecto y Pasapalabra. También dispone de pausa excepcional.

Atajos de teclado:

| Tecla | Acción |
|---|---|
| `1` | Correcto |
| `2` | Incorrecto |
| `3` | Pasapalabra |
| `4` | Pausa durante el juego; reanuda el turno cuando está en pausa |

Errar o pasar cede el turno al otro jugador con una pausa intermedia; la
reanudan el moderador o el jugador en turno. Si queda un solo jugador
activo, errar o pasar lo deja en espera (pausa), listo para continuar, y el
reloj se detiene.

Al terminar, las cuatro vistas muestran la pantalla final: quién ganó,
estadísticas de cada jugador, ambos roscos y el detalle de definiciones
con el resultado de cada letra.

## Reglas del juego

- Rosco de 27 letras (abecedario completo con Ñ).
- Pistas "contiene la letra" para J, Ñ, Q, Y y Z; "empieza con" para el resto.
- Colores: verde acierto, rojo error, amarillo pasapalabra, azul letra actual.
- Desempate: más aciertos, luego menos errores, luego más tiempo restante.
- Las definiciones no se repiten para el mismo jugador ni entre jugadores en
  la misma partida; se priorizan las menos usadas.

## Temáticas, palabras y letras

Cada **temática** tiene su propia base de definiciones. La temática
**Familiar** viene precargada con 293 definiciones. Las nuevas temáticas se
crean vacías.

En la pestaña **Palabras** se gestionan las definiciones por letra:
palabra, definición, tipo de pista, alternativas aceptadas, estado activa y
contador de usos. También se puede habilitar o deshabilitar cada letra sin
borrar sus definiciones; una letra con menos de 2 definiciones activas no
entra en juego. Las letras K y W están disponibles en el abecedario: traen
sus casillas para cargarles palabras cuando se las quiera incluir.

Los cambios quedan en borrador hasta **Guardar todo el listado**;
**Restablecer** los descarta y recarga desde el servidor.

## API

REST (base `/api`):

- Estado: `GET /health`, `GET /info`
- Temáticas: `GET /POST /themes`, `PUT /DELETE /themes/:id`
- Definiciones: `GET /themes/:id/definitions`, `PUT /themes/:id/bank`
- Letras: `GET /themes/:id/letters`, `PUT /themes/:id/letters/:letter`
- Partidas: `GET /POST /games`, `GET /games/:code`,
  `POST /games/:code/start|judge|resume`
- Dirección por partida: `PUT /games/:code/base-url` con
  `{ "baseUrl": "http://192.168.1.20:3000" }`

Las acciones del juego en vivo también están disponibles por WebSocket en
`/ws` (`join`, `start`, `judge`, `pause`, `resume`).

## Configuración

| Variable | Por defecto | Uso |
|---|---|---|
| `PORT` | `3000` | Puerto HTTP y WebSocket |
| `DATA_DIR` | `./data` | Carpeta del SQLite (`rosco.db`) |
| `PUBLIC_BASE_URL` | *(auto)* | Dirección pública para links y QR, ej. `http://192.168.1.50:3000` |

Ejemplo en `docker-compose.yml`:

```yaml
environment:
  - PUBLIC_BASE_URL=http://192.168.1.50:3000
```

Desarrollo local sin Docker:

```bash
npm install
npm run build
npm start
```

## Persistencia

Las temáticas, palabras, letras y partidas registradas se guardan en SQLite
(en Docker, en el volumen `rosco-data`) y sobreviven a los reinicios. El
estado vivo de una partida en curso está en memoria: si el servidor se
reinicia, esa partida se pierde.
