/* Vista del jugador: su rosco, su tiempo y su pregunta (sin respuesta).
   Si no es su turno, indica que es el turno del otro jugador. */
(function () {
  "use strict";
  var E = RoscoUI.esc;
  var m = location.pathname.match(/\/juego\/([^/]+)\/jugador([12])/);
  if (!m) { document.body.innerHTML = "<div class='waiting'>URL inválida.</div>"; return; }
  var code = m[1].toUpperCase(), me = Number(m[2]) - 1;
  var role = me === 0 ? "player1" : "player2";

  var elBadge = document.getElementById("p-badge");
  var elRosco = document.getElementById("rosco");
  var elBody = document.getElementById("p-body");
  var conn = null;

  function chips(p) {
    return "<div class='chips'>" +
      "<span class='chip'>Aciertos<b>" + p.correct + "</b></span>" +
      "<span class='chip'>Errores<b>" + p.wrong + "</b></span>" +
      "<span class='chip'>Pendientes<b>" + RoscoUI.pendingCount(p) + "</b></span></div>";
  }

  function render(st) {
    var me_ = st.players[me], other = st.players[1 - me];
    var myTurn = me_.isActive && st.status === "playing";
    var waiting = st.status === "playing" && !myTurn;

    // rosco con centro: nombre, tiempo, estado
    RoscoUI.renderRosco(elRosco, me_.letters, {
      size: Math.min(440, window.innerWidth - 80),
      center: {
        name: me_.name,
        time: RoscoUI.fmtTime(me_.timeSec),
        sub: myTurn ? "tu turno" : (waiting ? "en espera" : ""),
      },
    });

    // badge de estado
    var b = "En espera", cls = "badge wait";
    if (st.status === "playing") { b = "En juego"; cls = "badge"; }
    else if (st.status === "paused") { b = "En pausa"; cls = "badge pause"; }
    else if (st.status === "finished") { b = "Terminada"; cls = "badge wait"; }
    elBadge.className = cls;
    elBadge.textContent = b;

    // panel de información
    if (st.status === "finished") {
      var w = st.winner == null ? "Empate."
        : "Ganó " + E(st.players[st.winner].name) + ".";
      elBody.innerHTML = "<div class='eyebrow'>Partida terminada</div>" +
        "<h2 class='h-display'>Fin del juego</h2>" +
        "<p class='definition'>" + w + "</p>" + chips(me_);
      return;
    }
    if (st.status === "lobby") {
      elBody.innerHTML = "<div class='waiting'>Esperando que el moderador inicie la partida…</div>";
      return;
    }
    if (myTurn && me_.current) {
      elBody.innerHTML =
        "<div class='eyebrow'>Tu turno · " + E(me_.current.hint) + "</div>" +
        "<h2 class='h-display'>Letra " + E(me_.current.letter) + "</h2>" +
        "<p class='definition'>" + E(me_.current.definition) + "</p>" +
        "<p class='muted'>Respondé en voz alta, el moderador juzga.</p>" +
        chips(me_);
    } else if (st.status === "paused" && me_.isActive) {
      elBody.innerHTML =
        "<div class='eyebrow'>Pausa</div>" +
        "<h2 class='h-display'>Turno en pausa</h2>" +
        "<p class='definition'>" + E(st.pausedReason || "Esperando confirmación para reanudar…") + "</p>" +
        "<p><button class='ok' id='p-resume'>Reanudar mi turno</button></p>";
      document.getElementById("p-resume").addEventListener("click", function () {
        conn.send({ type: "resume" });
      });
    } else {
      elBody.innerHTML =
        "<div class='eyebrow'>En espera</div>" +
        "<h2 class='h-display'>Turno de " + E(other.name) + "</h2>" +
        "<p class='definition'>Esperá tu turno para responder.</p>" +
        chips(me_);
    }
  }

  conn = RoscoUI.connectGame(code, role, {
    onState: render,
    onError: function (e) {
      elBody.innerHTML = "<div class='waiting'>" + E(e) + "</div>";
    },
  });
})();

