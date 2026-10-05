/* Vista pública: el jugador activo en grande; al costado, en chico,
   el rosco del otro jugador con su próxima letra y tiempo restante. */
(function () {
  "use strict";
  var E = RoscoUI.esc;
  var m = location.pathname.match(/\/juego\/([^/]+)\/publico/);
  if (!m) { document.body.innerHTML = "<div class='waiting'>URL inválida.</div>"; return; }
  var code = m[1].toUpperCase();

  var elMain = document.getElementById("v-main");
  var elSide = document.getElementById("v-side");

  function chips(p) {
    return "<div class='chips'>" +
      "<span class='chip'>Aciertos<b>" + p.correct + "</b></span>" +
      "<span class='chip'>Errores<b>" + p.wrong + "</b></span>" +
      "<span class='chip'>Pendientes<b>" + RoscoUI.pendingCount(p) + "</b></span></div>";
  }

  function drawMain(p, sub) {
    var svg = document.getElementById("rosco-main");
    if (svg) RoscoUI.renderRosco(svg, p.letters, {
      size: Math.min(430, window.innerWidth - 120),
      center: { name: p.name, time: RoscoUI.fmtTime(p.timeSec), sub: sub },
    });
  }

  function drawSide(p, sub) {
    var svg = document.getElementById("rosco-side");
    if (svg) RoscoUI.renderRosco(svg, p.letters, {
      size: 230, compact: true,
      center: { name: p.name, time: RoscoUI.fmtTime(p.timeSec), sub: sub },
    });
  }

  function render(st) {
    var a = st.players[st.activePlayer], b = st.players[1 - st.activePlayer];

    if (st.status === "finished") {
      var w = st.winner == null ? "Empate."
        : "Ganó " + E(st.players[st.winner].name) + ".";
      elMain.innerHTML = "<div class='public-main-grid'><div><svg id='rosco-main'></svg></div>" +
        "<div><div class='eyebrow'>Partida terminada</div>" +
        "<h2 class='h-display'>Fin del juego</h2>" +
        "<p class='definition'>" + w + "</p>" + chips(a) + "</div></div>";
      drawMain(a, "");
      elSide.innerHTML = "<h2>" + E(b.name) + "</h2><svg id='rosco-side' class='side-rosco'></svg>";
      drawSide(b, "");
      return;
    }
    if (st.status === "lobby") {
      elMain.innerHTML = "<div class='waiting'>El juego está por comenzar…</div>";
      elSide.innerHTML = "<p class='muted'>—</p>";
      return;
    }

    // jugador activo en grande
    var info = "";
    if (a.current && st.status !== "paused") {
      info = "<div class='eyebrow'>Jugador activo · " + E(a.current.hint) + "</div>" +
        "<h2 class='h-display'>Letra " + E(a.current.letter) + "</h2>" +
        "<p class='definition'>" + E(a.current.definition) + "</p>";
    } else if (st.status === "paused") {
      info = "<div class='eyebrow'>Pausa</div>" +
        "<h2 class='h-display'>Juego en pausa</h2>" +
        "<p class='definition'>" + E(st.pausedReason || "") + "</p>";
    }
    elMain.innerHTML = "<div class='public-main-grid'><div><svg id='rosco-main'></svg></div>" +
      "<div>" + info + chips(a) + "</div></div>";
    drawMain(a, st.status === "playing" ? "turno activo" : "");

    // el otro jugador al costado
    var next = "—";
    for (var i = 0; i < b.letters.length; i++) {
      if (b.letters[i].status === "current" || b.letters[i].status === "pending") { next = b.letters[i].letter; break; }
    }
    elSide.innerHTML = "<h2 style='font-size:30px'>" + E(b.name) + "</h2>" +
      "<svg id='rosco-side' class='side-rosco'></svg>" +
      "<div class='side-stats'>" +
      "<div><div class='k'>Próxima letra</div><div class='v'>" + E(next) + "</div></div>" +
      "<div style='text-align:right'><div class='k'>Tiempo restante</div><div class='v'>" + RoscoUI.fmtTime(b.timeSec) + "</div></div>" +
      "</div>" +
      "<p class='muted' style='margin-top:12px'>Espera mientras responde " + E(a.name) + ".</p>";
    drawSide(b, st.status === "playing" ? "en espera" : "");
  }

  RoscoUI.connectGame(code, "public", { onState: render, onError: function () {} });
})();

